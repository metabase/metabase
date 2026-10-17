// Resolution of project modules, as jest's config describes it: the module
// name mapping, the module roots, and jest's order of file extensions.
import fs from "node:fs";
import path from "node:path";

import { project } from "./project.ts";

// jest's default moduleFileExtensions, in its order.
const EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".json",
  ".node",
];

const sourceRoots = project.modulePaths;
const topLevelNames = new Set(
  sourceRoots.flatMap((directory) => fs.readdirSync(directory)),
);

// Every spec file loads the project's modules again, so the same lookups
// repeat for the life of the worker. Only hits are kept, because a spec may
// create a file later.
const foundFiles = new Map<string, string>();
const rootLookups = new Map<string, string | null>();

/**
 * The file that a path names, with jest's extensions and index files tried in
 * jest's order.
 */
export function findFile(base: string): string | null {
  const known = foundFiles.get(base);
  if (known) {
    return known;
  }
  const found = findFileOnDisk(base);
  if (found) {
    foundFiles.set(base, found);
  }
  return found;
}

/**
 * The project file that a specifier names, or null when it names a package or
 * a builtin.
 */
export function resolveProjectFile(
  specifier: string,
  parentFile: string | undefined,
): string | null {
  for (const [pattern, target] of project.moduleNameMapper) {
    const match = specifier.match(pattern);
    if (match) {
      return findFile(
        target.replace(
          /\$(\d+)/g,
          (_, group: string) => match[Number(group)] ?? "",
        ),
      );
    }
  }
  if (
    specifier.startsWith(".") &&
    parentFile &&
    !parentFile.includes("/node_modules/")
  ) {
    return findFile(path.resolve(path.dirname(parentFile), specifier));
  }
  const [firstSegment] = specifier.split("/");
  if (!topLevelNames.has(firstSegment)) {
    return null;
  }
  if (!rootLookups.has(specifier)) {
    rootLookups.set(specifier, findInSourceRoots(specifier));
  }
  return rootLookups.get(specifier) ?? null;
}

/**
 * Watch mode: files were added, moved or deleted, so what the lookups found
 * may be out of date.
 */
export function forgetResolvedFiles(): void {
  foundFiles.clear();
  rootLookups.clear();
}

function findInSourceRoots(specifier: string): string | null {
  for (const directory of sourceRoots) {
    const found = findFile(path.join(directory, specifier));
    if (found) {
      return found;
    }
  }
  return null;
}

function findFileOnDisk(base: string): string | null {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    return base;
  }
  for (const extension of EXTENSIONS) {
    if (fs.existsSync(base + extension)) {
      return base + extension;
    }
  }
  for (const extension of EXTENSIONS) {
    const index = path.join(base, `index${extension}`);
    if (fs.existsSync(index)) {
      return index;
    }
  }
  return null;
}
