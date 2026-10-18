// Generic read-only search for OPNsense grid endpoints.
//
// The typescript client has no search_item/search_rule methods, so lists of
// aliases, filter rules, hosts etc. are unreachable. Every tool gets an extra
// `search` method that POSTs to /api/<module>/<controller>/search*.

export const SEARCH_METHOD = 'search';

// Exactly three segments, last one starting with "search"; no dots or slashes
const SEARCH_PATH = /^[a-z0-9_]+\/[a-z0-9_]+\/search[a-z0-9_]*$/i;

export function addSearchMethod(tool) {
  const props = tool.inputSchema.properties;
  return {
    ...tool,
    methods: [...tool.methods, SEARCH_METHOD],
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...props,
        method: { ...props.method, enum: [...props.method.enum, SEARCH_METHOD] },
        params: {
          ...props.params,
          properties: {
            ...props.params.properties,
            path: {
              type: 'string',
              description: "For method 'search': API path below /api, e.g. 'firewall/alias/search_item', " +
                "'firewall/filter/search_rule'. Use with searchPhrase, rowCount (-1 = all), current.",
            },
          },
        },
      },
    },
  };
}

export function buildSearchRequest(params = {}) {
  const { path, ...body } = params;
  if (typeof path !== 'string' || !SEARCH_PATH.test(path)) {
    throw new Error(`Invalid search path '${path}': expected <module>/<controller>/search..., e.g. firewall/alias/search_item`);
  }
  return { url: `/api/${path}`, body };
}
