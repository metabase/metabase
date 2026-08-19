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
 * `packages` are bare specifiers of third-party packages whose import-time work is consumed by code
 * that does not import them (a polyfill, a plugin on a host like `leaflet-draw` on `L`, global CSS).
 * It is hand-maintained: node_modules are not scanned, and a package it does not list is assumed
 * self-contained, its import-time work serving only its own exports.
 * A key matches its exact specifier and every subpath under it (`leaflet-draw` covers `leaflet-draw/x`).
 * A vendor whose plugins extend the host (dayjs) gets a facade, and other rules forbid importing it raw,
 * so it needs no entry here.
 * Keys are repo-relative paths; a key containing `*` is a micromatch pattern, and an exact key wins over a pattern.
 * `scripts/side-effect-files.js --check` keeps the file in step with the tree.
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
