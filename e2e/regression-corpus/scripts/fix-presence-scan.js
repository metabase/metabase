#!/usr/bin/env node
// Stage-0 pre-filter, Level 1 (existence only — no JVM). For every conflict whose fix
// commit touched BE product code AND shipped a BE test, check whether the deftests the fix
// ADDED still exist in the current tree. Gone => the fix was reverted/superseded (zombie);
// present => live candidate (confirm by running at HEAD in Level 2).
// Writes regression-corpus/fix-presence.jsonl. Read-only on the working tree.
const { execSync } = require("child_process");
const fs = require("fs");
const sh = (cmd) => { try { return execSync(cmd, { maxBuffer: 1e9 }).toString(); } catch (e) { return e.stdout ? e.stdout.toString() : ""; } };

const nameRe = /^\(deftest\s+(?:\^[^\s]+\s+)*([^\s()]+)/;

// 1. Set of all deftest names currently in the tree
const current = new Set();
for (const line of sh(`grep -rhE "^\\(deftest" test enterprise/backend/test 2>/dev/null`).split("\n")) {
  const m = line.match(nameRe);
  if (m) current.add(m[1]);
}
console.error(`current deftests in tree: ${current.size}`);

// 2. Conflicts
const rows = fs.readFileSync("regression-corpus/revert-check.jsonl", "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const conflicts = rows.filter((r) => r.status === "conflict" && r.commit);

const out = [];
let cand = 0;
for (const r of conflicts) {
  const files = sh(`git diff-tree --no-commit-id --name-only -r ${r.commit} 2>/dev/null`).split("\n").filter(Boolean);
  const prodBe = files.filter((f) => /^(src|enterprise\/backend\/src)\/.*\.(clj|cljc)$/.test(f));
  const testBe = files.filter((f) => /^(test|enterprise\/backend\/test)\/.*\.(clj|cljc)$/.test(f));
  if (!prodBe.length || !testBe.length) continue; // not a BE-with-shipped-test conflict
  cand++;
  const diff = sh(`git show ${r.commit} -- ${testBe.map((f) => `'${f}'`).join(" ")} 2>/dev/null`);
  const added = [];
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+")) continue;
    const m = line.slice(1).match(nameRe);
    if (m) added.push(m[1]);
  }
  const uniq = [...new Set(added)];
  if (!uniq.length) { out.push({ issue: r.issue, commit: r.commit, class: "no_added_deftest", prod_be: prodBe }); continue; }
  const live = uniq.filter((n) => current.has(n));
  const gone = uniq.filter((n) => !current.has(n));
  const cls = live.length === 0 ? "zombie" : gone.length === 0 ? "live_candidate" : "partial";
  out.push({ issue: r.issue, commit: r.commit, class: cls, added: uniq, live, gone, prod_be: prodBe });
}

fs.writeFileSync("regression-corpus/fix-presence.jsonl", out.map((o) => JSON.stringify(o)).join("\n") + "\n");
const by = {};
for (const o of out) by[o.class] = (by[o.class] || 0) + 1;
console.log(`BE-with-shipped-test conflict candidates: ${cand}`);
console.log(`by class (Level-1 existence): ${JSON.stringify(by)}`);
console.log(`live_candidate issues: ${out.filter((o) => o.class === "live_candidate").map((o) => o.issue).join(" ")}`);
console.log(`partial issues: ${out.filter((o) => o.class === "partial").map((o) => o.issue).join(" ")}`);
