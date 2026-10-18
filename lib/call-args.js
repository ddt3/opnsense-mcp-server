// Maps MCP tool params onto the positional arguments of OPNsense client methods.
//
// Client methods have signatures like `aliasDelItem(uuid, data, config)`:
// path args first, then an optional request body (`data`), then `config`.
// Path args are taken from params by name; the remaining keys form the body.

const BODY_ARG = 'data';
const CONFIG_ARG = 'config';
const BODY_WRAPPERS = ['data', 'item'];

export function getParamNames(fn) {
  const match = fn.toString().match(/^(?:async\s+)?[\w$]+\s*\(([^)]*)\)/);
  if (!match) {
    throw new Error(`Cannot parse parameters of method ${fn.name}`);
  }
  return match[1].split(',').map(s => s.trim()).filter(Boolean);
}

export function buildCallArgs(fn, params = {}) {
  const names = getParamNames(fn).filter(name => name !== CONFIG_ARG);
  const rest = { ...params };
  const args = [];

  // Fill path args first so they are not sent along in the body
  for (const name of names) {
    if (name === BODY_ARG) continue;
    const value = rest[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing required parameter '${name}' for ${fn.name}`);
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`Parameter '${name}' for ${fn.name} must be a string or number`);
    }
    delete rest[name];
  }

  for (const name of names) {
    args.push(name === BODY_ARG ? extractBody(rest) : encodeURIComponent(String(params[name])));
  }

  if (!names.includes(BODY_ARG) && Object.keys(rest).length > 0) {
    console.error(`Ignoring unused params for ${fn.name}: ${Object.keys(rest).join(', ')}`);
  }
  return args;
}

function extractBody(rest) {
  const keys = Object.keys(rest);
  if (keys.length === 0) return undefined;
  if (keys.length === 1 && BODY_WRAPPERS.includes(keys[0]) && isPlainObject(rest[keys[0]])) {
    return rest[keys[0]];
  }
  return rest;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
