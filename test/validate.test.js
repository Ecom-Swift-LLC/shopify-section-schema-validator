'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSource, findSchemas, MAX_BLOCKS, MAX_NAME_LENGTH } = require('../src/validate');

// Wraps a schema object in a section file, the way Liquid stores it.
function section(schema) {
  return `<div class="section">{{ section.settings.title }}</div>\n{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}\n`;
}

function messages(issues) {
  return issues.map((issue) => issue.message);
}

test('a valid section produces no issues', () => {
  const source = section({
    name: 'Hero banner',
    settings: [
      { type: 'text', id: 'title', label: 'Title' },
      { type: 'range', id: 'height', label: 'Height', min: 200, max: 800, step: 10 },
      { type: 'select', id: 'align', label: 'Align', options: [{ value: 'left', label: 'Left' }] },
    ],
    blocks: [{ type: 'button', name: 'Button', settings: [{ type: 'url', id: 'link', label: 'Link' }] }],
    presets: [{ name: 'Hero banner', settings: { title: 'Hello' }, blocks: [{ type: 'button' }] }],
  });
  assert.deepEqual(validateSource(source, 'sections/hero.liquid'), []);
});

test('a file with no schema tag has nothing to validate', () => {
  assert.deepEqual(validateSource('<p>{{ product.title }}</p>', 'snippets/x.liquid'), []);
});

test('invalid JSON is reported as an error with a line number', () => {
  const source = '<div></div>\n{% schema %}\n{ "name": "x", }\n{% endschema %}\n';
  const issues = validateSource(source, 'sections/bad.liquid');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'error');
  assert.match(issues[0].message, /not valid JSON/);
  assert.equal(issues[0].line, 3);
});

test('duplicate setting ids are an error', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [
      { type: 'text', id: 'title', label: 'A' },
      { type: 'text', id: 'title', label: 'B' },
    ],
  }));
  assert.ok(messages(issues).some((m) => m === 'duplicate setting id "title".'));
});

test('a missing top-level name is an error', () => {
  const issues = validateSource(section({ settings: [] }));
  assert.ok(messages(issues).includes('missing top-level "name".'));
});

test('a name longer than the limit is an error', () => {
  const issues = validateSource(section({ name: 'x'.repeat(MAX_NAME_LENGTH + 1) }));
  assert.ok(issues.some((i) => i.severity === 'error' && i.path === 'name'));
});

test('a select setting without options is an error', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [{ type: 'select', id: 'mode', label: 'Mode' }],
  }));
  assert.ok(messages(issues).some((m) => m === '"select" needs a non-empty "options" array.'));
});

test('a range setting without a step is an error', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [{ type: 'range', id: 'gap', label: 'Gap', min: 0, max: 40 }],
  }));
  assert.ok(messages(issues).includes('"range" needs a numeric "step".'));
});

test('a setting without an id or label is an error', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [{ type: 'text' }],
  }));
  assert.ok(messages(issues).includes('"text" setting is missing an "id".'));
  assert.ok(messages(issues).includes('"text" setting is missing a "label".'));
});

test('header and paragraph settings need no id', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [{ type: 'header', content: 'Layout' }, { type: 'paragraph', content: 'Help text' }],
  }));
  assert.deepEqual(issues, []);
});

test('duplicate block types are an error', () => {
  const issues = validateSource(section({
    name: 'X',
    blocks: [{ type: 'slide', name: 'Slide' }, { type: 'slide', name: 'Slide again' }],
  }));
  assert.ok(messages(issues).includes('duplicate block type "slide".'));
});

test('app and theme block types may repeat and need no name', () => {
  const issues = validateSource(section({
    name: 'X',
    blocks: [{ type: '@app' }, { type: '@app' }, { type: '@theme' }],
  }));
  assert.deepEqual(issues, []);
});

test('more than 50 blocks in a section is an error', () => {
  const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => ({ type: `b${i}`, name: `B${i}` }));
  const issues = validateSource(section({ name: 'X', blocks }));
  assert.ok(messages(issues).includes(`${MAX_BLOCKS + 1} blocks; the limit is ${MAX_BLOCKS} per section.`));
});

test('static blocks do not count toward the block limit', () => {
  const blocks = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => ({ type: `b${i}`, name: `B${i}`, static: i === 0 }));
  const issues = validateSource(section({ name: 'X', blocks }));
  assert.equal(issues.filter((i) => i.severity === 'error').length, 0);
});

test('max_blocks above 50 is an error', () => {
  const issues = validateSource(section({ name: 'X', max_blocks: 60 }));
  assert.ok(issues.some((i) => i.path === 'max_blocks' && i.severity === 'error'));
});

test('an unrecognised setting type is a warning, not an error', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [{ type: 'future_type', id: 'x', label: 'X' }],
  }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'warning');
});

test('a preset that sets an unknown setting is a warning', () => {
  const issues = validateSource(section({
    name: 'X',
    settings: [{ type: 'text', id: 'title', label: 'Title' }],
    presets: [{ name: 'Default', settings: { titel: 'typo' } }],
  }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'warning');
  assert.match(issues[0].message, /"titel"/);
});

test('a preset that uses an undefined block type is a warning', () => {
  const issues = validateSource(section({
    name: 'X',
    presets: [{ name: 'Default', blocks: [{ type: 'missing' }] }],
  }));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'warning');
});

test('more than one schema tag in a file is an error', () => {
  const schema = JSON.stringify({ name: 'X' });
  const source = `{% schema %}${schema}{% endschema %}\n{% schema %}${schema}{% endschema %}`;
  const issues = validateSource(source);
  assert.ok(messages(issues).some((m) => m.includes('a file can have only one')));
});

test('whitespace-control schema tags are found', () => {
  const schemas = findSchemas('{%- schema -%}{"name":"X"}{%- endschema -%}');
  assert.equal(schemas.length, 1);
  assert.deepEqual(validateSource('{%- schema -%}{"name":"X"}{%- endschema -%}'), []);
});

test('a duplicate setting id is reported on the second occurrence', () => {
  const source = '{% schema %}\n{\n  "name": "X",\n  "settings": [\n    { "type": "text", "id": "t", "label": "A" },\n    { "type": "text", "id": "t", "label": "B" }\n  ]\n}\n{% endschema %}';
  const issues = validateSource(source);
  const duplicate = issues.find((i) => i.message.startsWith('duplicate setting id'));
  assert.equal(duplicate.line, 6);
});
