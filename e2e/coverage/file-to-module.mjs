import path from "node:path";
import { fileURLToPath } from "node:url";

import micromatch from "micromatch";

import { elements } from "../../frontend/lint/module-boundaries.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Precompiled once, in element order (precedence: e.g. mlv1 before mlv2, with
// the catch-all shared/other last). Same matcher as the affected-tests planner
// (micromatch.makeRe with dot:true), so module identity is consistent across
// both tools. dot:true so files in dot-directories (e.g. .storybook) still map.
const NODES = elements.map((el) => ({
  type: el.type,
  regex: micromatch.makeRe(el.pattern, { dot: true }),
}));

// Maps a source file to its module. Accepts absolute paths (as embedded by
// Istanbul) or repo-relative paths. Returns the element type (e.g.
// "feature/dashboard", "shared/databases") or null for files outside the
// registry (node_modules, cljs, build output).
export function fileToModule(file) {
  const rel = path.isAbsolute(file) ? path.relative(REPO_ROOT, file) : file;
  if (rel.startsWith("..")) {
    return null;
  }
  return NODES.find((node) => node.regex.test(rel))?.type ?? null;
}

export { REPO_ROOT };
