#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateSource } = require('../src/validate');

const USAGE = 'Usage: sscv <theme-dir | file.liquid> [--json] [--strict]';

// A theme directory is scanned through its sections/ and blocks/ folders. Anything else is scanned in full.
function collectFiles(target) {
  if (fs.statSync(target).isFile()) return [target];

  const roots = ['sections', 'blocks']
    .map((folder) => path.join(target, folder))
    .filter((folder) => fs.existsSync(folder));
  const files = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (entry.name.endsWith('.liquid')) {
        files.push(full);
      }
    }
  };

  (roots.length ? roots : [target]).forEach(walk);
  return files;
}

function printHuman(files, issues) {
  const byFile = new Map();
  for (const issue of issues) {
    if (!byFile.has(issue.file)) byFile.set(issue.file, []);
    byFile.get(issue.file).push(issue);
  }

  for (const [file, fileIssues] of byFile) {
    process.stdout.write(`${file}\n`);
    for (const issue of fileIssues) {
      const where = issue.path ? `${issue.path}: ` : '';
      process.stdout.write(`  line ${issue.line}  ${issue.severity}  ${where}${issue.message}\n`);
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  process.stdout.write(`\nChecked ${files.length} file(s): ${errors} error(s), ${warnings} warning(s).\n`);
}

function main(argv) {
  const asJson = argv.includes('--json');
  const strict = argv.includes('--strict');
  const targets = argv.filter((arg) => !arg.startsWith('--'));

  if (targets.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const target = targets[0];
  if (!fs.existsSync(target)) {
    process.stderr.write(`Not found: ${target}\n`);
    return 2;
  }

  const files = collectFiles(target);
  const issues = files.flatMap((file) => {
    const display = path.relative(process.cwd(), file).split(path.sep).join('/');
    return validateSource(fs.readFileSync(file, 'utf8'), display);
  });

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ files: files.length, issues }, null, 2)}\n`);
  } else if (issues.length === 0) {
    process.stdout.write(`Checked ${files.length} file(s): no schema problems found.\n`);
  } else {
    printHuman(files, issues);
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return errors > 0 || (strict && warnings > 0) ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, collectFiles };
