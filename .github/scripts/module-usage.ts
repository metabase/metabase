// Builds module-level "usage" maps: for each module, the set of modules that
// depend on it, both directly and indirectly
//
// Both are computed at the FILE level off the real dependency-cruiser import
// graph, then collapsed to module granularity at the very end.
//
//   bunx depcruise frontend/src enterprise/frontend/src \
//     --config .dependency-cruiser.cjs --output-type json > dependency-graph.json
//   DEP_GRAPH_JSON=dependency-graph.json \
//   OUT_JSON=usage.json OUT_DIRECT_JSON=usage-direct.json \
//     bun .github/scripts/module-usage.ts

import { readFileSync, writeFileSync } from "node:fs";

import { elements } from "../../frontend/lint/module-boundaries.mjs";

import {
  buildFileGraph,
  getAffectedFiles,
  mapFileToModule,
  parseCruiseModules,
} from "./affected-modules";

const depGraphPath = process.env.DEP_GRAPH_JSON ?? "dependency-graph.json";
const { modules } = JSON.parse(readFileSync(depGraphPath, "utf8"));

const fileDependencies = parseCruiseModules(modules);
const fileGraph = buildFileGraph(elements, fileDependencies);

// Group every known source file by its owning module. We seed from the cruise
// output's `source` files plus everything that appears as a dependency target,
// so files imported but never importing are still covered.
const filesByModule = new Map<string, string[]>();
const allFiles = new Set<string>();
for (const { source, dependencies } of fileDependencies) {
  allFiles.add(source);
  for (const dep of dependencies) {
    allFiles.add(dep);
  }
}
for (const file of allFiles) {
  const module = mapFileToModule(fileGraph.nodes, file);
  if (!module) {
    continue;
  }
  const list = filesByModule.get(module);
  if (list) {
    list.push(file);
  } else {
    filesByModule.set(module, [file]);
  }
}

// Ensure every module appears as a key, even those nothing depends on.
const emptyDependents = (): Record<string, Set<string>> => {
  const map: Record<string, Set<string>> = {};
  for (const module of filesByModule.keys()) {
    map[module] = new Set();
  }
  return map;
};

// DIRECT usage: module B directly depends on module A if any file in B imports
// any file in A — a single edge in the import graph, collapsed to modules.
const directDependents = emptyDependents();
for (const { source, dependencies } of fileDependencies) {
  const importer = mapFileToModule(fileGraph.nodes, source);
  if (!importer) {
    continue;
  }
  for (const target of dependencies) {
    const owner = mapFileToModule(fileGraph.nodes, target);
    if (owner && owner !== importer) {
      directDependents[owner].add(importer);
    }
  }
}

// TRANSITIVE usage: for each module, take all its files, walk the file-level
// reverse graph to get every file that transitively imports them, collapse to
// modules, and drop the module itself.
const transitiveDependents = emptyDependents();
for (const [module, files] of filesByModule) {
  const affectedFiles = getAffectedFiles(fileGraph, files);
  for (const file of affectedFiles) {
    const owner = mapFileToModule(fileGraph.nodes, file);
    if (owner && owner !== module) {
      transitiveDependents[module].add(owner);
    }
  }
}

// Stable, sorted output for clean diffs.
const toSorted = (
  map: Record<string, Set<string>>,
): Record<string, string[]> => {
  const sorted: Record<string, string[]> = {};
  for (const module of Object.keys(map).sort()) {
    sorted[module] = [...map[module]].sort();
  }
  return sorted;
};

const writeOut = (
  map: Record<string, Set<string>>,
  outVar: string,
  label: string,
) => {
  const sorted = toSorted(map);
  const json = JSON.stringify(sorted, null, 2) + "\n";
  const outPath = process.env[outVar];
  if (outPath) {
    writeFileSync(outPath, json);
    process.stderr.write(
      `Wrote ${Object.keys(sorted).length} modules (${label}) to ${outPath}.\n`,
    );
  } else {
    process.stdout.write(json);
  }
};

writeOut(transitiveDependents, "OUT_JSON", "transitive");
writeOut(directDependents, "OUT_DIRECT_JSON", "direct");
