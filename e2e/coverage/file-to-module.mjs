import path from "node:path";
import { fileURLToPath } from "node:url";

import micromatch from "micromatch";

import { elements } from "../../frontend/lint/module-boundaries.mjs";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Maps a source file to its module using the same element registry the
// boundary linter uses, so module identity is canonical across both tools.
// Accepts absolute paths (as embedded by Istanbul) or repo-relative paths.
// Returns the element type (e.g. "feature/dashboard", "shared/databases")
// or null for files outside the registry (node_modules, cljs, build output).
export function fileToModule(file) {
  const rel = path.isAbsolute(file) ? path.relative(REPO_ROOT, file) : file;
  if (rel.startsWith("..")) {
    return null;
  }
  // First match wins — elements are ordered for precedence (e.g. mlv1 before
  // mlv2, with the catch-all shared/other last).
  for (const element of elements) {
    if (micromatch.isMatch(rel, element.pattern)) {
      return element.type;
    }
  }
  return null;
}

export { REPO_ROOT };
