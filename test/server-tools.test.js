import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Starts the built server over stdio; no OPNsense is contacted because the
// API client is only created on the first real call.
async function withServer(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL('../index.js', import.meta.url).pathname],
    env: { OPNSENSE_URL: 'https://127.0.0.1:9', OPNSENSE_API_KEY: 'k', OPNSENSE_API_SECRET: 's', ...env },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test('server lists catalog tools and gives every tool call and endpoints', async () => {
  await withServer({ INCLUDE_PLUGINS: 'true' }, async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);
    for (const name of ['firewall_manage', 'radvd_manage', 'hostdiscovery_manage', 'plugin_netbird_manage']) {
      assert.ok(names.includes(name), `${name} missing`);
    }
    for (const tool of tools) {
      const methods = tool.inputSchema.properties.method.enum;
      assert.ok(methods.includes('call') && methods.includes('endpoints'), `${tool.name} lacks call/endpoints`);
    }
  });
});

test('plugin catalog tools stay hidden without INCLUDE_PLUGINS', async () => {
  await withServer({}, async (client) => {
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes('radvd_manage'));
    assert.ok(!names.includes('plugin_netbird_manage'));
  });
});

test('endpoints answers from the catalog without contacting OPNsense', async () => {
  await withServer({}, async (client) => {
    const res = await client.callTool({ name: 'radvd_manage', arguments: { method: 'endpoints', params: { filter: 'search' } } });
    const body = JSON.parse(res.content[0].text);
    assert.ok(body.count >= 1);
    assert.ok(body.endpoints.every(e => e.path.startsWith('radvd/')));
  });
});

test('call reports unknown endpoints with a suggestion', async () => {
  await withServer({}, async (client) => {
    const res = await client.callTool({ name: 'firewall_manage', arguments: { method: 'call', params: { path: 'firewall/filter/savepoint' } } });
    assert.match(res.content[0].text, /Unknown API endpoint 'firewall\/filter\/savepoint'/);
  });
});
