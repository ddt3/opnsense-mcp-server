// Reads OPNsense API controllers from PHP source to fill gaps in the docs.
//
// The docs list each controller's own actions, but miss actions inherited
// from custom base classes (QuaggaControllerBase, FilterBaseController,
// LeasesController) and controllers that only inherit (kea leases4).
// Walking the class chain in the sources recovers those endpoints.

import { parseParams } from './api-catalog.js';

const NAMESPACE = /^namespace\s+([\w\\]+)\s*;/m;
const USE = /^use\s+([\w\\]+?)(?:\s+as\s+(\w+))?\s*;/gm;
const CLASS = /^(abstract\s+)?class\s+(\w+)\s+extends\s+([\w\\]+)/m;
const ACTION = /public\s+function\s+(\w+)Action\s*\(([^)]*)\)/g;
const NEXT_FUNCTION = /\n\s*(?:public|protected|private)?\s*(?:static\s+)?function\s+\w+\s*\(/g;
// Same POST detection as the docs generator (opnsense/docs lib/__init__.py)
const POST_MARKERS = /isPost\(|->(?:add|set|del|toggle|search)Base\(|->setAction\(/;
const GET_MARKERS = /isGet\(|->searchBase\(/;
// .../controllers/OPNsense/<Module>/Api/<Name>Controller.php
const ROUTABLE = /\/controllers\/OPNsense\/(\w+)\/Api\/(\w+)Controller\.php$/;

export function snakeCase(name) {
  return name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();
}

// "$uuid = null, string $x='a'" -> parseParams() format
function phpParams(text) {
  const names = text.split(',').map(p => p.trim()).filter(Boolean).map(p => {
    const [decl, ...def] = p.split('=');
    const name = decl.trim().split(/\s+/).pop();
    return def.length ? `${name}=${def.join('=').trim()}` : name;
  });
  return parseParams(names.join(','));
}

function httpMethods(name, body) {
  const methods = new Set();
  if (POST_MARKERS.test(body)) methods.add('POST');
  if (GET_MARKERS.test(body)) methods.add('GET');
  if (!methods.size) methods.add(name === 'set' ? 'POST' : 'GET');
  return [...methods].sort();
}

export function parseController(text, file) {
  const cls = text.match(CLASS);
  if (!cls) return null;
  const namespace = text.match(NAMESPACE)?.[1] ?? '';
  const uses = new Map();
  for (const [, fqn, alias] of text.matchAll(USE)) uses.set(alias ?? fqn.split('\\').pop(), fqn);

  const parentRef = cls[3];
  const parent = parentRef.startsWith('\\') ? parentRef.slice(1)
    : uses.get(parentRef) ?? (parentRef.includes('\\') ? parentRef : `${namespace}\\${parentRef}`);

  // Function bodies end where the next function starts
  const starts = [...text.matchAll(NEXT_FUNCTION)].map(m => m.index);
  const actions = [...text.matchAll(ACTION)].map(m => {
    const end = starts.find(s => s > m.index) ?? text.length;
    const body = text.slice(m.index, end);
    return { name: m[1], params: phpParams(m[2]), methods: httpMethods(m[1], body) };
  });

  const route = file.match(ROUTABLE);
  return {
    fqn: `${namespace}\\${cls[2]}`,
    parent,
    abstract: Boolean(cls[1]),
    actions,
    file,
    route: route && !cls[1] ? { module: route[1].toLowerCase(), controller: snakeCase(route[2]) } : null,
  };
}

// Endpoints of routable controllers including every inherited action
export function controllerEndpoints(classes, kindOf) {
  const byFqn = new Map(classes.map(c => [c.fqn, c]));
  const endpoints = [];
  for (const cls of classes.filter(c => c.route)) {
    const seen = new Set();
    for (let current = cls; current; current = byFqn.get(current.parent)) {
      for (const action of current.actions) {
        const command = snakeCase(action.name);
        if (seen.has(command)) continue;
        seen.add(command);
        endpoints.push({
          path: `${cls.route.module}/${cls.route.controller}/${command}`,
          module: cls.route.module,
          controller: cls.route.controller,
          command,
          methods: action.methods,
          params: action.params,
          kind: kindOf(cls.file),
          source: current === cls ? basename(cls.file) : `${basename(cls.file)} (inherited from ${current.fqn.split('\\').pop()})`,
        });
      }
    }
  }
  return endpoints;
}

function basename(file) {
  return file.split('/').pop();
}
