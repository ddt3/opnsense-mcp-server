// Server version, read from package.json so banner, help and serverInfo agree.
import { createRequire } from 'node:module';

export const VERSION = createRequire(import.meta.url)('../package.json').version;
