#!/usr/bin/env node
/**
 * Like-for-like Playwright vs Cypress timing comparison, matched per source spec.
 *
 * Both sides are summed per-spec durations, which is the only pairing that means
 * anything: shard wall-time is not comparable (we run workers=2, so a shard-minute
 * holds up to two minutes of test execution), and job time includes setup.
 *
 * Usage:
 *   gh run download <run-id> --pattern "playwright-timings-s*" --dir /tmp/pwt
 *   node scripts/compare-timings.mjs /tmp/pwt
 *
 * 🔴 Match on the FULL source path, never the basename. `reproductions.cy.spec.ts`
 * exists in several directories; a basename match silently collapses them onto one
 * Cypress entry and inflates the "faster" column. That bug produced a wrong 1.67x
 * on first run — the corrected figure is 1.71x.
 */
import fs from "fs";
import path from "path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: compare-timings.mjs <dir-with-playwright-timings-s*>");
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, "../..");

// --- Playwright: sum FIRST-ATTEMPT durations per spec file (retries excluded) ---
const pw = new Map();
let retryMs = 0;
const walk = (suites, file) => {
  for (const s of suites) {
    const f = s.file ?? file;
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) {
        (t.results ?? []).forEach((r, i) => {
          const d = r.duration ?? 0;
          if (i === 0) pw.set(f, (pw.get(f) ?? 0) + d);
          else retryMs += d;
        });
      }
    }
    walk(s.suites ?? [], f);
  }
};
for (const shard of fs.readdirSync(dir)) {
  const p = path.join(dir, shard, "playwright-results.json");
  if (fs.existsSync(p)) walk(JSON.parse(fs.readFileSync(p, "utf8")).suites ?? []);
}

// --- Cypress: timings.json, keyed on the path below scenarios/ ---
const cy = new Map();
for (const e of JSON.parse(
  fs.readFileSync(path.join(ROOT, "e2e/support/timings.json"), "utf8"),
).durations) {
  cy.set(e.spec.split("scenarios/").pop(), e.duration);
}

// --- map port -> upstream source, read from each port's header ---
const srcOf = new Map();
const testsDir = path.join(ROOT, "e2e-playwright/tests");
for (const f of fs.readdirSync(testsDir).filter((n) => n.endsWith(".spec.ts"))) {
  const head = fs.readFileSync(path.join(testsDir, f), "utf8").slice(0, 4000);
  const m = head.match(/scenarios\/([A-Za-z0-9_./-]+\.cy\.spec\.[jt]s)/);
  if (m) srcOf.set(f, m[1]);
}

const seen = new Set();
const pairs = [];
for (const [specFile, ms] of pw) {
  const src = srcOf.get(path.basename(specFile ?? ""));
  if (!src || !cy.has(src) || seen.has(src)) continue;
  seen.add(src);
  pairs.push([path.basename(specFile), ms, cy.get(src)]);
}

const min = (ms) => ms / 60000;
const pwT = pairs.reduce((a, p) => a + p[1], 0);
const cyT = pairs.reduce((a, p) => a + p[2], 0);
const faster = pairs.filter((p) => p[1] < p[2]).length;

console.log(`matched specs : ${pairs.length}`);
console.log(`playwright    : ${min(pwT).toFixed(1)} min`);
console.log(`cypress       : ${min(cyT).toFixed(1)} min`);
console.log(
  `ratio         : ${(pwT / cyT).toFixed(2)}x ${pwT > cyT ? "slower" : "faster"}`,
);
console.log(
  `faster in PW  : ${faster}/${pairs.length} (${Math.round((100 * faster) / pairs.length)}%)`,
);
console.log(`retry time excluded: ${min(retryMs).toFixed(1)} min`);
console.log("\nbiggest regressions:");
for (const [b, a, c] of [...pairs].sort((x, y) => y[1] - y[2] - (x[1] - x[2])).slice(0, 10)) {
  console.log(
    `  +${min(a - c).toFixed(2)}m  ${b.padEnd(46)} pw=${min(a).toFixed(2)} cy=${min(c).toFixed(2)}`,
  );
}
