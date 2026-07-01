#!/usr/bin/env node
// Verifies oxlint/ESLint rule parity for the hybrid lint setup.
//
// Two things can break the hybrid (see frontend/lint/oxlint-migration.md):
//   1. A rule is turned OFF in ESLint (because the dedup plugin thinks oxlint owns
//      it) but is NOT actually enforced by oxlint  -> the rule is silently DROPPED.
//   2. A rule runs in BOTH oxlint and ESLint -> wasted work (not a correctness bug).
//
// This script is fast (a couple of seconds) because it only inspects resolved
// configs plus one clean oxlint run. The exhaustive behavioral proof (diff oxlint +
// hybrid-ESLint findings against a golden pre-migration ESLint baseline on real
// code) is documented in frontend/lint/oxlint-migration.md.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OXLINT = require.resolve("oxlint/package.json").replace("package.json", "bin/oxlint");
const PATHS = ["enterprise/frontend", "frontend", "e2e"];

// Strip plugin prefixes so `react/x`, `@typescript-eslint/x`, `import-x/x`, `jest/x`
// and oxlint's `typescript/x`/`import/x` all compare on the bare rule name.
const bare = (name) => name.slice(name.lastIndexOf("/") + 1);

function oxlintEnforcedRules() {
  const cfg = JSON.parse(execFileSync(OXLINT, ["--print-config"], { encoding: "utf8" }));
  const enforced = new Set();
  const collect = (rules) => {
    for (const [name, val] of Object.entries(rules ?? {})) {
      const sev = Array.isArray(val) ? val[0] : val;
      if (sev !== "off" && sev !== "allow" && sev !== 0) {
        enforced.add(bare(name));
      }
    }
  };
  collect(cfg.rules);
  for (const o of cfg.overrides ?? []) {
    collect(o.rules);
  }
  return enforced;
}

async function eslintDedupedRules() {
  const { default: oxlint } = await import("eslint-plugin-oxlint");
  const disabled = new Set();
  for (const c of oxlint.buildFromOxlintConfigFile(".oxlintrc.json")) {
    for (const name of Object.keys(c.rules ?? {})) {
      disabled.add(bare(name));
    }
  }
  return disabled;
}

function oxlintRunsClean() {
  try {
    execFileSync(OXLINT, ["--max-warnings", "0", ...PATHS], { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const oxEnforced = oxlintEnforcedRules();
const eslintDisabled = await eslintDedupedRules();

// THE critical invariant: everything ESLint stopped running must be run by oxlint.
const dropped = [...eslintDisabled].filter((r) => !oxEnforced.has(r)).sort();

console.log(`oxlint enforces:                 ${oxEnforced.size} rules`);
console.log(`ESLint defers to oxlint for:     ${eslintDisabled.size} rules`);
console.log(`Silently dropped (must be 0):    ${dropped.length}`);

const clean = oxlintRunsClean();
console.log(`oxlint clean on whole tree:      ${clean ? "yes" : "NO"}`);

if (dropped.length > 0) {
  console.error("\nGAP — these rules are off in ESLint but not enforced by oxlint:");
  for (const r of dropped) console.error(`  - ${r}`);
}

const ok = dropped.length === 0 && clean;
console.log(`\n${ok ? "PASS: rules parity holds." : "FAIL: parity broken (see above)."}`);
process.exit(ok ? 0 : 1);
