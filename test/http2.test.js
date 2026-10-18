import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enableHttp2, resolveHttpVersion } from '../lib/http2.js';

function fakeHttp() {
  return {
    client: {
      defaults: {
        auth: { username: 'key', password: 'secret' },
        headers: { common: { Accept: 'application/json' } },
      },
    },
  };
}

test('resolveHttpVersion defaults to 2 for https and honours OPNSENSE_HTTP_VERSION=1', () => {
  assert.equal(resolveHttpVersion('https://fw.example:8443', undefined), 2);
  assert.equal(resolveHttpVersion('https://fw.example', '2'), 2);
  assert.equal(resolveHttpVersion('https://fw.example', '1'), 1);
  assert.equal(resolveHttpVersion('https://fw.example', '1.1'), 1);
});

test('resolveHttpVersion keeps HTTP/1.1 for plain http URLs', () => {
  assert.equal(resolveHttpVersion('http://192.168.1.1', undefined), 1);
  assert.equal(resolveHttpVersion('http://192.168.1.1', '2'), 1);
});

test('resolveHttpVersion rejects unknown values', () => {
  assert.throws(() => resolveHttpVersion('https://fw.example', '3'), /OPNSENSE_HTTP_VERSION/);
});

test('enableHttp2 switches axios to HTTP/2 with an explicit Basic auth header', () => {
  const http = fakeHttp();
  enableHttp2(http, { verifySsl: true });
  const d = http.client.defaults;
  assert.equal(d.httpVersion, 2);
  assert.equal(d.auth, undefined);
  assert.equal(d.headers.common.Authorization, 'Basic ' + Buffer.from('key:secret').toString('base64'));
  assert.equal(d.headers.common.Accept, 'application/json');
  assert.equal(d.http2Options.rejectUnauthorized, true);
});

test('enableHttp2 carries verifySsl=false into http2Options', () => {
  const http = fakeHttp();
  enableHttp2(http, { verifySsl: false });
  assert.equal(http.client.defaults.http2Options.rejectUnauthorized, false);
});
