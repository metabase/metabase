import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** True when the module at `metaUrl` is the script node was started with (argv resolved, symlinks followed). */
export function isMain(metaUrl: string): boolean {
  const script = process.argv[1];
  return script !== undefined && realpathSync(script) === realpathSync(fileURLToPath(metaUrl));
}
