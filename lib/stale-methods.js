// Detects client methods whose endpoint OPNsense no longer has.
//
// The typescript client predates several OPNsense releases, so a few dozen
// of its methods point at removed or renamed actions and only return a bare
// 404. The endpoint is read from the method source, corrected the same way
// as at call time, and checked against the API catalog.

import { fixUrl } from './url-fixes.js';

const URL_TEMPLATE = /`(\/api\/[^`]*)`/;

// "module/controller/command" a client method calls, or null if unclear
export function endpointOf(fn) {
  const match = fn.toString().match(URL_TEMPLATE);
  if (!match) return null;
  const parts = fixUrl(match[1].split('?')[0]).split('/').filter(Boolean).slice(1);
  const fixed = parts.slice(0, 3);
  if (fixed.length < 3 || fixed.some(part => part.includes('${'))) return null;
  return fixed.join('/');
}

// Error message for a stale method, or null when its endpoint exists
export function staleMethodError(catalog, fn) {
  const endpoint = endpointOf(fn);
  if (!endpoint || catalog.find(endpoint)) return null;
  const hint = catalog.suggest(endpoint);
  return `${fn.name} calls /api/${endpoint}, which is not in the OPNsense API anymore` +
    (hint.length ? `. Similar endpoints: ${hint.join(', ')}` : '') +
    ". Use method 'call' with one of those paths, or pass unchecked: true to try it anyway.";
}
