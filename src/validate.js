'use strict';

// Rules come from Shopify's section schema reference:
// https://shopify.dev/docs/themes/architecture/sections/section-schema
// and the numeric limits page:
// https://shopify.dev/docs/storefronts/themes/architecture/limits

// Snapshot of the documented setting types. Shopify adds types over time, so an
// unrecognised type is reported as a warning rather than an error.
const SETTING_TYPES = new Set([
  'article', 'blog', 'checkbox', 'collection', 'collection_list', 'color',
  'color_background', 'color_scheme', 'color_scheme_group', 'font', 'header',
  'html', 'image_picker', 'inline_richtext', 'link', 'link_list', 'liquid',
  'metaobject', 'metaobject_list', 'number', 'page', 'paragraph', 'product',
  'product_list', 'radio', 'range', 'richtext', 'select', 'text', 'textarea',
  'url', 'variant', 'video', 'video_url',
]);

// Types that display content rather than collect a value, so they need no id or label.
const DISPLAY_ONLY_TYPES = new Set(['header', 'paragraph']);

// Block types that stand in for app or theme blocks. They are not named, may repeat,
// and are exempt from the duplicate-type check.
const SPECIAL_BLOCK_TYPES = new Set(['@app', '@theme']);

const MAX_NAME_LENGTH = 25;
const MAX_BLOCKS = 50;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

// Finds every {% schema %} ... {% endschema %} block, including whitespace-control variants.
function findSchemas(source) {
  const found = [];
  const pattern = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const bodyOffset = match.index + match[0].indexOf('%}') + 2;
    found.push({ body: match[1], bodyLine: lineAt(source, bodyOffset) });
  }
  return found;
}

// Maps the nth match of a pattern inside the schema body back to a line in the whole file.
function lineInBody(schema, pattern, nth = 1) {
  if (!pattern) return schema.bodyLine;
  const matcher = new RegExp(pattern.source, 'g');
  let match;
  let count = 0;
  while ((match = matcher.exec(schema.body)) !== null) {
    count += 1;
    if (count === nth) {
      return schema.bodyLine + schema.body.slice(0, match.index).split('\n').length - 1;
    }
  }
  return schema.bodyLine;
}

function idPattern(id) {
  return new RegExp(`"id"\\s*:\\s*"${escapeRegExp(id)}"`);
}

function typePattern(type) {
  return new RegExp(`"type"\\s*:\\s*"${escapeRegExp(type)}"`);
}

function checkSettings(list, path, report) {
  const ids = new Set();
  const seen = new Map();
  if (list === undefined) return ids;
  if (!Array.isArray(list)) {
    report('error', null, path, 'must be an array.');
    return ids;
  }

  list.forEach((setting, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(setting)) {
      report('error', null, itemPath, 'must be an object.');
      return;
    }
    if (typeof setting.type !== 'string') {
      report('error', null, itemPath, 'missing "type".');
      return;
    }

    const type = setting.type;
    const hasId = typeof setting.id === 'string' && setting.id !== '';
    const where = hasId ? idPattern(setting.id) : null;

    if (!DISPLAY_ONLY_TYPES.has(type)) {
      if (!hasId) {
        report('error', null, itemPath, `"${type}" setting is missing an "id".`);
      } else {
        const count = (seen.get(setting.id) || 0) + 1;
        seen.set(setting.id, count);
        if (count > 1) {
          report('error', where, itemPath, `duplicate setting id "${setting.id}".`, count);
        } else {
          ids.add(setting.id);
        }
      }
      if (setting.label === undefined) {
        report('error', where, itemPath, `"${type}" setting is missing a "label".`);
      }
    }

    if (!SETTING_TYPES.has(type)) {
      report('warning', where, itemPath, `unrecognised setting type "${type}"; check it against Shopify's setting type reference.`);
    }
    if ((type === 'select' || type === 'radio') && !(Array.isArray(setting.options) && setting.options.length > 0)) {
      report('error', where, itemPath, `"${type}" needs a non-empty "options" array.`);
    }
    if (type === 'range') {
      for (const key of ['min', 'max', 'step']) {
        if (typeof setting[key] !== 'number') {
          report('error', where, itemPath, `"range" needs a numeric "${key}".`);
        }
      }
    }
  });

  return ids;
}

function checkBlocks(list, report) {
  const types = new Set();
  if (list === undefined) return types;
  if (!Array.isArray(list)) {
    report('error', /"blocks"\s*:/, 'blocks', 'must be an array.');
    return types;
  }

  let counted = 0;
  const seen = new Map();
  list.forEach((block, index) => {
    const itemPath = `blocks[${index}]`;
    if (!isPlainObject(block)) {
      report('error', null, itemPath, 'must be an object.');
      return;
    }
    if (typeof block.type !== 'string') {
      report('error', null, itemPath, 'missing "type".');
      return;
    }

    const special = SPECIAL_BLOCK_TYPES.has(block.type);
    const where = special ? null : typePattern(block.type);

    if (!special) {
      const count = (seen.get(block.type) || 0) + 1;
      seen.set(block.type, count);
      if (block.name === undefined) {
        report('error', where, itemPath, `block "${block.type}" is missing a "name".`);
      }
      if (count > 1) {
        report('error', where, itemPath, `duplicate block type "${block.type}".`, count);
      }
      types.add(block.type);
    }
    if (typeof block.name === 'string' && block.name.length > MAX_NAME_LENGTH) {
      report('error', where, itemPath, `block name is ${block.name.length} characters; the limit is ${MAX_NAME_LENGTH}.`);
    }
    if (!block.static) counted += 1;

    checkSettings(block.settings, `${itemPath}.settings`, report);
  });

  if (counted > MAX_BLOCKS) {
    report('error', /"blocks"\s*:/, 'blocks', `${counted} blocks; the limit is ${MAX_BLOCKS} per section.`);
  }
  return types;
}

function checkPresets(list, settingIds, blockTypes, report) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    report('error', /"presets"\s*:/, 'presets', 'must be an array.');
    return;
  }

  list.forEach((preset, index) => {
    const itemPath = `presets[${index}]`;
    if (!isPlainObject(preset)) {
      report('error', null, itemPath, 'must be an object.');
      return;
    }
    if (preset.name === undefined) {
      report('error', /"presets"\s*:/, itemPath, 'missing "name".');
    }
    if (isPlainObject(preset.settings)) {
      for (const key of Object.keys(preset.settings)) {
        if (!settingIds.has(key)) {
          const keyPattern = new RegExp(`"${escapeRegExp(key)}"\\s*:`);
          report('warning', keyPattern, `${itemPath}.settings`, `sets "${key}", which is not a setting on this section.`);
        }
      }
    }
    if (Array.isArray(preset.blocks)) {
      preset.blocks.forEach((block, blockIndex) => {
        if (!isPlainObject(block) || typeof block.type !== 'string') return;
        if (SPECIAL_BLOCK_TYPES.has(block.type) || blockTypes.has(block.type)) return;
        report('warning', typePattern(block.type), `${itemPath}.blocks[${blockIndex}]`, `uses block type "${block.type}", which is not defined in "blocks".`);
      });
    }
  });
}

// Validates every {% schema %} tag in one Liquid source string.
// Returns an array of { file, line, severity, path, message } objects.
function validateSource(source, file = 'file.liquid') {
  const issues = [];
  const schemas = findSchemas(source);

  const add = (severity, line, path, message) => {
    issues.push({ file, line, severity, path, message });
  };

  if (schemas.length > 1) {
    add('error', schemas[1].bodyLine, '', `found ${schemas.length} {% schema %} tags; a file can have only one.`);
  }
  if (schemas.length === 0) return issues;

  const schema = schemas[0];
  let data;
  try {
    data = JSON.parse(schema.body);
  } catch (error) {
    const position = /position (\d+)/.exec(error.message);
    const line = position
      ? schema.bodyLine + schema.body.slice(0, Number(position[1])).split('\n').length - 1
      : schema.bodyLine;
    add('error', line, '', `schema is not valid JSON: ${error.message}`);
    return issues;
  }

  if (!isPlainObject(data)) {
    add('error', schema.bodyLine, '', 'schema must be a JSON object.');
    return issues;
  }

  const report = (severity, pattern, path, message, nth = 1) => {
    add(severity, lineInBody(schema, pattern, nth), path, message);
  };

  if (data.name === undefined) {
    report('error', /"name"\s*:/, '', 'missing top-level "name".');
  } else if (typeof data.name === 'string' && data.name.length > MAX_NAME_LENGTH) {
    report('error', /"name"\s*:/, 'name', `name is ${data.name.length} characters; the limit is ${MAX_NAME_LENGTH}.`);
  } else if (typeof data.name !== 'string' && !isPlainObject(data.name)) {
    report('error', /"name"\s*:/, 'name', 'must be a string or a translation object.');
  }

  if (data.max_blocks !== undefined) {
    const valid = Number.isInteger(data.max_blocks) && data.max_blocks >= 0 && data.max_blocks <= MAX_BLOCKS;
    if (!valid) {
      report('error', /"max_blocks"\s*:/, 'max_blocks', `must be a whole number from 0 to ${MAX_BLOCKS}.`);
    }
  }

  const settingIds = checkSettings(data.settings, 'settings', report);
  const blockTypes = checkBlocks(data.blocks, report);
  checkPresets(data.presets, settingIds, blockTypes, report);

  return issues;
}

module.exports = { validateSource, findSchemas, SETTING_TYPES, MAX_BLOCKS, MAX_NAME_LENGTH };
