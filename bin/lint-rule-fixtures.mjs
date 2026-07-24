#!/usr/bin/env node
// Behavioral canary for the oxlint rules that `bin/lint-rules-check.mjs` cannot
// verify statically. That script proves a rule's plugin is loaded; it cannot prove
// the rule actually fires. Pattern-semantic rules can be fully wired yet dead: a
// `no-restricted-imports` group written with regex lookaround (unsupported by the
// Rust engine) or an extglob that matches nothing silently bans nothing, and the run
// stays green. That class bit us during the migration.
//
// Each case writes a tiny fixture at a path that matches the rule's override scope,
// lints it with the real `.oxlintrc.json`, and asserts the rule does (or, for the
// negated-glob exception, does not) fire. Fixtures are written under `__rule-fixtures__`
// directories and removed afterwards; they are never committed.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = "__rule-fixtures__";

// file: path relative to repo root, chosen so the rule's override scope applies.
// rule: the bare rule name as it appears in oxlint's `(...)` diagnostic suffix.
// shouldFire: whether linting the code must report that rule.
const cases = [
  {
    name: "no-restricted-imports bans metabase/* in component tests",
    file: `e2e/test-component/${MARKER}/ban.cy.spec.tsx`,
    code: 'import { foo } from "metabase/lib/expressions";\nexport const x = foo;\n',
    rule: "no-restricted-imports",
    shouldFire: true,
  },
  {
    name: "no-restricted-imports honors the metabase/utils/promise exception",
    file: `e2e/test-component/${MARKER}/allow.cy.spec.tsx`,
    code: 'import { foo } from "metabase/utils/promise";\nexport const x = foo;\n',
    rule: "no-restricted-imports",
    shouldFire: false,
  },
  {
    name: "i18next/no-literal-string flags untranslated JSX text",
    file: `frontend/src/metabase/${MARKER}/literal.tsx`,
    code: "export const C = () => <div>Hello world</div>;\n",
    rule: "no-literal-string",
    shouldFire: true,
  },
  {
    name: "no-console flags a bare console.log",
    file: `frontend/src/metabase/${MARKER}/console.ts`,
    code: 'export function f() {\n  console.log("hi");\n}\n',
    rule: "no-console",
    shouldFire: true,
  },
  {
    name: "metabase/no-conditional-expect flags expect() inside a branch",
    file: `frontend/src/metabase/${MARKER}/cond.unit.spec.tsx`,
    code: 'it("t", () => {\n  if (Math.random()) {\n    expect(1).toBe(1);\n  }\n});\n',
    rule: "no-conditional-expect",
    shouldFire: true,
  },
  {
    name: "react-hooks/rules-of-hooks flags a conditional hook",
    file: `frontend/src/metabase/${MARKER}/hook.tsx`,
    code: 'import { useState } from "react";\nexport function C({ x }: { x: boolean }) {\n  if (x) {\n    useState();\n  }\n  return null;\n}\n',
    rule: "rules-of-hooks",
    shouldFire: true,
  },
  {
    name: "metabase/no-base-color-literals flags an mb-base-color literal",
    file: `frontend/src/metabase/${MARKER}/color.ts`,
    code: 'export const c = "mb-base-color-brand";\n',
    rule: "no-base-color-literals",
    shouldFire: true,
  },
];

const cleanup = () => {
  const dirs = new Set(
    cases.map((c) => path.join(root, path.dirname(c.file))),
  );
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// Remove any stragglers from an interrupted run, then write the fixtures.
cleanup();
for (const c of cases) {
  const abs = path.join(root, c.file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, c.code);
}

// Resolve the binary through node rather than assuming `node_modules/.bin` exists;
// package managers differ in how (and whether) they link it.
const oxlintBin = require
  .resolve("oxlint/package.json")
  .replace("package.json", "bin/oxlint");

let output;
let spawnError;
let status;
try {
  const result = spawnSync(
    oxlintBin,
    ["-c", ".oxlintrc.json", ...cases.map((c) => c.file)],
    { cwd: root, encoding: "utf8" },
  );
  spawnError = result.error;
  status = result.status;
  output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
} finally {
  cleanup();
}

// "oxlint produced no diagnostics" and "oxlint never ran" look identical once the
// output is parsed, so rule out the second explicitly before blaming the rules.
if (spawnError) {
  console.error(`Could not run oxlint (${oxlintBin}): ${spawnError.message}`);
  process.exit(1);
}
if (/No files found to lint/i.test(output)) {
  console.error(
    "oxlint linted none of the fixtures — they were filtered out before any rule ran.",
  );
  console.error(output.trim());
  process.exit(1);
}

// Collect (file -> set of fired rule names) from the diagnostics.
const fired = new Map();
const line = /^(\S+):\d+:\d+:\s+(?:warning|error)\s+[^(]*\(([^)]+)\)/;
for (const text of output.split("\n")) {
  const match = line.exec(text);
  if (!match) {
    continue;
  }
  const [, file, rule] = match;
  if (!fired.has(file)) {
    fired.set(file, new Set());
  }
  fired.get(file).add(rule);
}

let failed = false;
for (const c of cases) {
  const didFire = fired.get(c.file)?.has(c.rule) ?? false;
  const ok = didFire === c.shouldFire;
  if (!ok) {
    failed = true;
    const expected = c.shouldFire ? "fire" : "not fire";
    console.error(`FAIL: expected ${c.rule} to ${expected} — ${c.name}`);
  }
}

if (failed) {
  console.error(
    "\nA rule is enabled but not behaving as configured (a pattern may be silently dead).",
  );
  console.error(`\noxlint exit status: ${status}`);
  console.error("oxlint output was:");
  console.error(output.trim() || "  (no output at all)");
  process.exit(1);
}

console.log(`PASS: ${cases.length} rule fixtures behaved as configured.`);
