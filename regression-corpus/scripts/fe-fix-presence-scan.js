#!/usr/bin/env node
// FE analog of fix-presence-scan: over the conflict population, find fixes that touched FE
// PRODUCT code (frontend/enterprise-frontend .ts/tsx/js/jsx, not a spec/story) AND shipped
// a FE unit test (*.unit.spec.* / *.spec.*). The shipped spec is the oracle (jest). Liveness
// = does the spec file still exist on HEAD? Read-only. Writes fe-fix-presence.jsonl.
const { execSync } = require("child_process");
const fs = require("fs");
const sh = (c) => { try { return execSync(c, { maxBuffer: 1e9 }).toString(); } catch (e) { return e.stdout ? e.stdout.toString() : ""; } };

const isProd = (f) => /^(frontend|enterprise\/frontend)\/src\/.*\.(ts|tsx|js|jsx)$/.test(f) && !/\.(unit\.)?spec\.|\.stories\./.test(f);
const isTest = (f) => /^(frontend|enterprise\/frontend).*\.(unit\.spec|spec)\.(ts|tsx|js|jsx)$/.test(f);
const existsHead = (f) => { try { execSync(`git cat-file -e HEAD:'${f}' 2>/dev/null`); return true; } catch (e) { return false; } };

const rows = fs.readFileSync("regression-corpus/revert-check.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const conflicts = rows.filter((r) => r.status === "conflict" && r.commit);

const out = [];
let cand = 0;
for (const r of conflicts) {
  const files = sh(`git diff-tree --no-commit-id --name-only -r ${r.commit} 2>/dev/null`).split("\n").filter(Boolean);
  const prod = files.filter(isProd);
  const test = files.filter(isTest);
  if (!prod.length || !test.length) continue;
  cand++;
  const liveTests = test.filter(existsHead);
  const goneTests = test.filter((f) => !existsHead(f));
  const cls = liveTests.length === 0 ? "all_specs_gone" : goneTests.length ? "partial" : "live_candidate";
  out.push({ issue: r.issue, commit: r.commit, class: cls, prod, live_specs: liveTests, gone_specs: goneTests });
}
fs.writeFileSync("regression-corpus/fe-fix-presence.jsonl", out.map((o) => JSON.stringify(o)).join("\n") + "\n");
const by = {}; for (const o of out) by[o.class] = (by[o.class] || 0) + 1;
console.log(`FE-with-shipped-test conflict candidates: ${cand}`);
console.log(`by class: ${JSON.stringify(by)}`);
console.log(`live_candidate issues: ${out.filter((o) => o.class === "live_candidate").map((o) => o.issue).join(" ")}`);
