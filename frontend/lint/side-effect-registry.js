/**
 * @fileoverview Reads frontend/lint/side-effect-files.json, the registry of source files that
 * `metabase/no-module-side-effects` reports as doing work at import time.
 *
 * Every file it reports is listed, classified once by a human:
 *   "self"   the effect only matters to the file's own importers (its own singleton or listener,
 *            a value it exports), so dropping the file with its importers is correct
 *   "global" the effect is consumed by code that does not import the file (a polyfill, a vendor patch,
 *            a registry the app reads, a plugin slot write), so the file must be loaded from an entry
 *   "entry"  a bundle entry or a side-effects list, effectful by design
 * `unclassified` files are treated as "global" until someone classifies them.
 * `facades` are directory prefixes whose effect is their own exports (`metabase/ui`, `metabase/dayjs`),
 * so importing them with bindings is always fine.
 * Keys are repo-relative paths; a key containing `*` is a micromatch pattern, and an exact key wins over a pattern.
 * `scripts/side-effect-files.js --check` keeps the file in step with the tree.
 */

const fs = require("fs");
const path = require("path");

const micromatch = require("micromatch");

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "side-effect-files.json");

const CLASSIFICATIONS = ["self", "global", "entry"];

function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const files = registry.files || {};
  const patterns = Object.keys(files).filter((key) => key.includes("*"));
  return {
    facades: registry.facades || [],
    files,
    patterns,
    unclassified: new Set(registry.unclassified || []),
  };
}

// The classification of a repo-relative file, or null when the registry does not list it.
function classify(registry, file) {
  if (file in registry.files) {
    return registry.files[file];
  }
  if (registry.unclassified.has(file)) {
    return "global";
  }
  const matched = registry.patterns.filter((pattern) =>
    micromatch.isMatch(file, pattern),
  );
  return matched.length > 0 ? registry.files[matched[0]] : null;
}

function isFacade(registry, file) {
  return registry.facades.some((prefix) => file.startsWith(prefix));
}

// Problems a hand-edited registry can have. Empty when it is well formed.
function validateRegistry(registry, effectFiles) {
  const problems = [];
  for (const [key, value] of Object.entries(registry.files)) {
    if (!CLASSIFICATIONS.includes(value)) {
      problems.push(`${key}: unknown classification "${value}"`);
    }
    if (registry.unclassified.has(key)) {
      problems.push(`${key}: both classified and unclassified`);
    }
  }
  for (const file of effectFiles) {
    if (file in registry.files) {
      continue;
    }
    const values = new Set(
      registry.patterns
        .filter((pattern) => micromatch.isMatch(file, pattern))
        .map((pattern) => registry.files[pattern]),
    );
    if (values.size > 1) {
      problems.push(
        `${file}: matches patterns with different classifications, add an exact entry`,
      );
    }
  }
  return problems;
}

module.exports = {
  DEFAULT_REGISTRY_PATH,
  CLASSIFICATIONS,
  loadRegistry,
  classify,
  isFacade,
  validateRegistry,
};
