/**
 * @fileoverview Reads frontend/lint/side-effect-files.json, the registry of source files that run code at import time.
 *
 * The file list is generated, not written by hand.
 * `bun frontend/lint/scripts/side-effect-files.js --update` lints the whole tree with `metabase/no-module-side-effects` and adds every reported file as `unclassified`,
 * and the unit test frontend/lint/tests/side-effect-files.unit.spec.js fails when the list has drifted from the tree.
 * A human then sets each file's classification once:
 *   "self"   only the file's own importers rely on what it does (its own singleton, a value it exports), so dropping it with its importers is safe
 *   "global" code that does not import the file relies on what it does (a polyfill, a vendor patch, a plugin slot write), so it must be loaded from an entry
 *   "entry"  a bundle entry or a side-effects list, effectful by design
 * An `unclassified` file counts as "global" until someone classifies it.
 *
 * Keys are repo-relative paths.
 * A key containing `*` is a micromatch pattern, and an exact key wins over a pattern.
 * `facades` are directory prefixes whose only effect is their own exports (`metabase/ui`, `metabase/dayjs`), so importing them with bindings is always fine.
 * `packages` is the one hand-written list: third-party packages whose import-time work is relied on by code that does not import them (a polyfill, `leaflet-draw` on `L`, global CSS).
 * node_modules are not scanned, so a package that is not listed is assumed to serve only its own exports.
 * A package key matches its exact specifier and every subpath under it (`leaflet-draw` covers `leaflet-draw/x`).
 */

const fs = require("fs");
const path = require("path");

const micromatch = require("micromatch");

const DEFAULT_REGISTRY_PATH = path.resolve(__dirname, "side-effect-files.json");

const CLASSIFICATIONS = ["self", "global", "entry"];

const PACKAGE_CLASSIFICATIONS = ["global"];

function loadRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const files = registry.files || {};
  const patterns = Object.keys(files).filter((key) => key.includes("*"));
  return {
    facades: registry.facades || [],
    files,
    packages: registry.packages || {},
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

// The classification of a package import source, or null when the registry does not list the package.
function classifyPackage(registry, source) {
  const listed = Object.keys(registry.packages).find(
    (specifier) => source === specifier || source.startsWith(`${specifier}/`),
  );
  return listed == null ? null : registry.packages[listed];
}

// Problems a hand-edited classification can introduce.
// Empty when the registry is well formed.
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
  for (const [specifier, value] of Object.entries(registry.packages)) {
    if (specifier === "" || specifier.startsWith(".")) {
      problems.push(`packages: "${specifier}" is not a bare specifier`);
    }
    if (!PACKAGE_CLASSIFICATIONS.includes(value)) {
      problems.push(`${specifier}: unknown package classification "${value}"`);
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
  classifyPackage,
  isFacade,
  validateRegistry,
};
