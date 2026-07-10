#!/usr/bin/env node
// Scan e2e specs for tests whose titles reference an issue: (metabase#NNNNN),
// or describe("issue NNNNN"). Emits JSONL: {spec, line, kind, skipped, title, issues}
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../e2e/test");
const out = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.cy\.spec\.(js|ts|jsx|tsx)$/.test(entry.name)) scan(p);
  }
}

const TITLE_RE = /\b(it|describe)(\.skip)?\s*\(\s*(["'`])((?:\\.|(?!\3).)*)\3/g;

function scan(file) {
  const src = fs.readFileSync(file, "utf8");
  const lines = src.split("\n");
  lines.forEach((lineText, i) => {
    TITLE_RE.lastIndex = 0;
    let m;
    while ((m = TITLE_RE.exec(lineText))) {
      const [, kind, skip, , title] = m;
      const issues = new Set();
      for (const im of title.matchAll(/metabase#(\d{3,6})/g)) issues.add(+im[1]);
      // describe("issue 12345") / describe("issues 123, 456")
      for (const im of title.matchAll(/\bissues?\s+#?(\d{4,6})/gi)) issues.add(+im[1]);
      for (const im of title.matchAll(/,\s*(\d{4,6})\b/g)) {
        if (/\bissues?\s/i.test(title)) issues.add(+im[1]);
      }
      if (issues.size) {
        out.push({
          spec: path.relative(path.resolve(__dirname, "../.."), file),
          line: i + 1,
          kind,
          skipped: !!skip,
          title,
          issues: [...issues].sort((a, b) => a - b),
        });
      }
    }
  });
}

walk(ROOT);
out.sort((a, b) => a.spec.localeCompare(b.spec) || a.line - b.line);
fs.writeFileSync(
  path.join(__dirname, "../repro-tests.jsonl"),
  out.map((o) => JSON.stringify(o)).join("\n") + "\n"
);

// summary
const its = out.filter((o) => o.kind === "it");
const issueSet = new Set(out.flatMap((o) => o.issues));
console.log(`entries: ${out.length} (it: ${its.length}, describe: ${out.length - its.length}, skipped: ${out.filter(o=>o.skipped).length})`);
console.log(`unique issues: ${issueSet.size}`);
const buckets = {};
for (const n of issueSet) buckets[Math.floor(n / 10000) * 10000] = (buckets[Math.floor(n / 10000) * 10000] || 0) + 1;
console.log("issue-number distribution (proxy for age):", JSON.stringify(buckets));
