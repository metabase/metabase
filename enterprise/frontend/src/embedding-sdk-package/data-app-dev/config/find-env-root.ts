import fs from "node:fs";
import path from "node:path";

// How many parent dirs above the app to search for `.env.local`. Covers the
// deepest supported layout where the app is synced into a parent repo as
// `<repo>/data_apps/<app>` (2 levels deep). `.git` is a hard stop — `.env.local`
// lives at the repo root, so we never search above it.
const MAX_ENV_SEARCH_DEPTH = 2;

/** Walk up from `start` to the dir holding `.env.local` (or the git root). */
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
