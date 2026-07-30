import fs from "node:fs";
import path from "node:path";

// Covers the deepest layout, `<repo>/data_apps/<app>`. `.git` is a hard stop.
const MAX_ENV_SEARCH_DEPTH = 2;

export function findEnvRoot(start: string): string {
  let dir = start;

  for (let i = 0; i <= MAX_ENV_SEARCH_DEPTH; i++) {
    if (
      fs.existsSync(path.join(dir, ".env.local")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return start;
}
