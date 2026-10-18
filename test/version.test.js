import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION } from '../lib/version.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('VERSION comes from package.json', () => {
  assert.equal(VERSION, pkg.version);
});

test('no hardcoded server version left in index.js or the build template', () => {
  for (const file of ['../index.js', '../src/build.ts']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /0\.6\.0/, `${file} still contains 0.6.0`);
  }
});
