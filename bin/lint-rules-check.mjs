#!/usr/bin/env node
// Guards oxlint rule wiring. Adapted from PR #77361's parity checker for the
// sole-linter setup, where there is no ESLint config to diff against.
//
// #77361 compared two independent sources (the rules ESLint deferred vs the rules
// oxlint enforces) and failed when the second did not cover the first. We have only
// one config, and `oxlint --print-config` echoes a rule even when its plugin is not
// loaded, so that comparison is vacuous here. Instead this checks the two wiring
// failures that a single config can still hide:
//
//   1. A rule enabled under a plugin that is not loaded. oxlint keeps it in the
//      resolved config but never fires it (the `plugins: []` trap from the
//      migration). We check every enforced rule's namespace against the plugins and
//      jsPlugins the config actually loads.
//   2. A rule silently added to or dropped from the enforced set, checked against a
//      committed snapshot. Drift fails until you re-run with `--update`.
//
// It does NOT catch pattern-semantic dead rules (a `no-restricted-imports` regex
// using lookaround, an extglob that matches nothing): those still need the
// behavioral fixtures described in frontend/lint/oxlint-migration.md.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "frontend/lint/enforced-rules.json");
const update = process.argv.includes("--update");

const namespaceOf = (rule) =>
  rule.includes("/") ? rule.slice(0, rule.lastIndexOf("/")) : null;
const stripPluginPrefix = (name) => name.replace(/^eslint-plugin-/, "");

// The namespace a jsPlugin publishes under is its `meta.name` (minus the
// `eslint-plugin-` prefix); plugins that omit `meta.name` fall back to their
// package name, which is how oxlint derives it too.
function jsPluginNamespaces(jsPlugins) {
  const namespaces = new Set();
  for (const specifier of jsPlugins ?? []) {
    let name;
    try {
      const mod = require(
        specifier.startsWith(".") ? path.join(root, specifier) : specifier,
      );
      name = (mod.default ?? mod).meta?.name;
    } catch {
      // fall through to the package-name fallback below
    }
    if (!name) {
      name = specifier.startsWith(".")
        ? path.basename(path.dirname(specifier))
        : specifier;
    }
    namespaces.add(stripPluginPrefix(name));
  }
  return namespaces;
}

function enforcedRules(config) {
  const rules = new Set();
  const collect = (block) => {
    for (const [name, value] of Object.entries(block ?? {})) {
      const severity = Array.isArray(value) ? value[0] : value;
      if (severity !== "off" && severity !== "allow" && severity !== 0) {
        rules.add(name);
      }
    }
  };
  collect(config.rules);
  for (const override of config.overrides ?? []) {
    collect(override.rules);
  }
  return [...rules].sort();
}

function inspect(label, configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const loaded = new Set([
    ...(config.plugins ?? []),
    ...jsPluginNamespaces(config.jsPlugins),
  ]);
  const rules = enforcedRules(config);
  const unbacked = rules.filter((rule) => {
    const namespace = namespaceOf(rule);
    return namespace !== null && !loaded.has(namespace);
  });
  return { label, rules, unbacked };
}

const mainConfig = JSON.parse(
  fs.readFileSync(path.join(root, ".oxlintrc.json"), "utf8"),
);
const boundariesConfig = JSON.parse(
  fs.readFileSync(path.join(root, ".oxlintrc.boundaries.json"), "utf8"),
);

const configs = [
  inspect("main", path.join(root, ".oxlintrc.json")),
  inspect("boundaries", path.join(root, ".oxlintrc.boundaries.json")),
];

let failed = false;

// The boundaries config is standalone (it does not `extends` the main config,
// because oxlint's `extends` inherits neither `ignorePatterns` nor `settings`).
// It restates the main config's ignore list and resolver, so guard against
// drift: the boundaries pass must ignore everything main ignores (plus custom-viz)
// and resolve imports the same way, or it silently lints the wrong files.
const CUSTOM_VIZ_IGNORE = "enterprise/frontend/src/custom-viz/**";
const expectedIgnores = [...mainConfig.ignorePatterns, CUSTOM_VIZ_IGNORE];
const actualIgnores = boundariesConfig.ignorePatterns ?? [];
if (JSON.stringify(actualIgnores) !== JSON.stringify(expectedIgnores)) {
  failed = true;
  console.error(
    "\nboundaries: ignorePatterns drifted from the main config. Expected the " +
      `main list plus "${CUSTOM_VIZ_IGNORE}". Sync .oxlintrc.boundaries.json.`,
  );
}
const mainResolver = JSON.stringify(mainConfig.settings?.["import/resolver"]);
const boundariesResolver = JSON.stringify(
  boundariesConfig.settings?.["import/resolver"],
);
if (mainResolver !== boundariesResolver) {
  failed = true;
  console.error(
    "\nboundaries: import/resolver drifted from the main config. Sync .oxlintrc.boundaries.json.",
  );
}

for (const { label, unbacked } of configs) {
  if (unbacked.length > 0) {
    failed = true;
    console.error(
      `\n${label}: ${unbacked.length} enforced rule(s) whose plugin is not loaded (they never fire):`,
    );
    for (const rule of unbacked) {
      console.error(`  - ${rule}`);
    }
  }
}

const current = Object.fromEntries(configs.map((c) => [c.label, c.rules]));

if (update) {
  fs.writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + "\n");
  console.log(
    `Wrote ${snapshotPath.replace(root + "/", "")}: ` +
      configs.map((c) => `${c.label} ${c.rules.length}`).join(", "),
  );
  process.exit(failed ? 1 : 0);
}

if (!fs.existsSync(snapshotPath)) {
  console.error(`\nMissing ${snapshotPath}. Run: bun run lint-rules --update`);
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
for (const { label, rules } of configs) {
  const previous = snapshot[label] ?? [];
  const added = rules.filter((r) => !previous.includes(r));
  const removed = previous.filter((r) => !rules.includes(r));
  if (added.length || removed.length) {
    failed = true;
    console.error(`\n${label}: enforced rule set drifted from the snapshot.`);
    for (const r of added) {
      console.error(`  + ${r}`);
    }
    for (const r of removed) {
      console.error(`  - ${r}`);
    }
  }
}

if (failed) {
  console.error(
    "\nFAIL. If the change is intentional, re-run: bun run lint-rules --update",
  );
  process.exit(1);
}

console.log(
  "PASS: every enforced rule is backed by a loaded plugin and matches the snapshot " +
    `(${configs.map((c) => `${c.label} ${c.rules.length}`).join(", ")}).`,
);
