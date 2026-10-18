import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_METHOD, addSearchMethod, buildSearchRequest } from '../lib/search.js';

const tool = {
  name: 'firewall_manage',
  module: 'firewall',
  methods: ['aliasAddItem'],
  inputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string', enum: ['aliasAddItem'] },
      params: { type: 'object', properties: { searchPhrase: { type: 'string' } } },
    },
    required: ['method'],
  },
};

test('addSearchMethod adds search to methods, enum and a path param, without mutating input', () => {
  const out = addSearchMethod(tool);
  assert.deepEqual(out.methods, ['aliasAddItem', SEARCH_METHOD]);
  assert.deepEqual(out.inputSchema.properties.method.enum, ['aliasAddItem', SEARCH_METHOD]);
  assert.equal(out.inputSchema.properties.params.properties.path.type, 'string');
  assert.ok(out.inputSchema.properties.params.properties.searchPhrase);
  assert.deepEqual(tool.methods, ['aliasAddItem']);
  assert.equal(tool.inputSchema.properties.params.properties.path, undefined);
});

test('buildSearchRequest maps path to /api URL and the rest to the body', () => {
  assert.deepEqual(
    buildSearchRequest({ path: 'firewall/alias/search_item', searchPhrase: 'x', rowCount: 5 }),
    { url: '/api/firewall/alias/search_item', body: { searchPhrase: 'x', rowCount: 5 } },
  );
  assert.deepEqual(buildSearchRequest({ path: 'firewall/filter/searchRule' }).url, '/api/firewall/filter/searchRule');
});

test('buildSearchRequest only allows <module>/<controller>/search* paths', () => {
  for (const path of [
    undefined,
    '',
    'firewall/alias/del_item',
    'firewall/alias/search_item/abc',
    '../core/system/reboot',
    'firewall/../core/search_x',
    '/api/firewall/alias/search_item',
    'firewall/alias/search_item?x=1',
  ]) {
    assert.throws(() => buildSearchRequest({ path }), /search path/, `accepted: ${path}`);
  }
});
