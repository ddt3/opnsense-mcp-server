import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixUrl, patchHttpClient } from '../lib/url-fixes.js';

test('fixUrl maps the broken firmware prefix onto /api/core/firmware', () => {
  assert.equal(fixUrl('/api/firmware/firmware/status'), '/api/core/firmware/status');
  assert.equal(fixUrl('/api/firmware/firmware/changelog/26.7.2'), '/api/core/firmware/changelog/26.7.2');
  assert.equal(fixUrl('/api/firmware/firmware/details/os-haproxy'), '/api/core/firmware/details/os-haproxy');
});

test('fixUrl leaves other URLs alone', () => {
  for (const url of ['/api/core/firmware/status', '/api/firewall/alias/get', '/api/firmware/other/x', '/api/firmwarex/firmware/y']) {
    assert.equal(fixUrl(url), url);
  }
});

test('patchHttpClient rewrites the URL for every verb and keeps the other args', async () => {
  const calls = [];
  const http = {};
  for (const verb of ['get', 'post', 'put', 'delete', 'patch']) {
    http[verb] = async function (url, ...rest) {
      calls.push({ verb, self: this, url, rest });
      return verb;
    };
  }
  patchHttpClient(http);

  assert.equal(await http.get('/api/firmware/firmware/info', { a: 1 }), 'get');
  assert.equal(await http.post('/api/firmware/firmware/check', { b: 2 }, { c: 3 }), 'post');
  await http.put('/api/firmware/firmware/x', {});
  await http.delete('/api/firewall/alias/del');
  await http.patch('/api/firmware/firmware/y', {});

  assert.deepEqual(calls.map(c => c.url), [
    '/api/core/firmware/info',
    '/api/core/firmware/check',
    '/api/core/firmware/x',
    '/api/firewall/alias/del',
    '/api/core/firmware/y',
  ]);
  assert.deepEqual(calls[0].rest, [{ a: 1 }]);
  assert.deepEqual(calls[1].rest, [{ b: 2 }, { c: 3 }]);
  assert.ok(calls.every(c => c.self === http));
});

test('patchHttpClient is idempotent', async () => {
  const urls = [];
  const http = { post: async (url) => urls.push(url) };
  patchHttpClient(http);
  patchHttpClient(http);
  await http.post('/api/firmware/firmware/status');
  assert.deepEqual(urls, ['/api/core/firmware/status']);
});
