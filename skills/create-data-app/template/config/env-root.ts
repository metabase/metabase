import fs from "node:fs";
import path from "node:path";

// How many parent dirs above the app to search for `.env.local`. Covers the
// deepest supported layout where the app is synced into a parent repo as
// <repo>/data_apps/<app> (2 levels deep). The git root (`.git`) is a hard stop:
// `.env.local` lives at the repo root, so we never search above it.
const MAX_ENV_SEARCH_DEPTH = 2;

const ENV_FILE = ".env.local";
const GIT_DIR = ".git";

export function findEnvRoot(start: string): string {
  let dir = start;

  for (let i = 0; i <= MAX_ENV_SEARCH_DEPTH; i++) {
    if (fs.existsSync(path.join(dir, ENV_FILE))) {
      return dir;
    }

    // The git root is the outermost place `.env.local` can live; stop here
    // rather than escaping the repo into unrelated parent directories.
    if (fs.existsSync(path.join(dir, GIT_DIR))) {
      return dir;
    }

    dir = path.dirname(dir);
  }

  return start;
}
