#!/usr/bin/env node
/**
 * Generates support/INDEX.md: one line per export across support/*.ts, with
 * the first line of its doc comment. Agents read this instead of grepping
 * every module. Regenerate after adding helpers: node scripts/build-helper-index.mjs
 */
import fs from "fs";
import path from "path";

const SUPPORT = path.resolve(import.meta.dirname, "../support");
const out = [
  "# Helper index (generated — do not edit; run scripts/build-helper-index.mjs)",
  "",
];

for (const file of fs.readdirSync(SUPPORT).sort()) {
  if (!file.endsWith(".ts") || file === "INDEX.md") continue;
  const lines = fs.readFileSync(path.join(SUPPORT, file), "utf8").split("\n");
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(
      /^export (?:async )?(?:function|const|class) ([A-Za-z0-9_]+)/,
    );
    if (!match) continue;
    // Walk back over the doc comment to find its first sentence.
    let doc = "";
    for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
      const line = lines[j].trim();
      if (line === "*/" || line.startsWith("*") || line.startsWith("/**")) {
        const text = line.replace(/^\/?\*+\/?/, "").trim();
        if (text) doc = text;
        if (line.startsWith("/**")) break;
      } else {
        break;
      }
    }
    entries.push(`- \`${match[1]}\`${doc ? ` — ${doc}` : ""}`);
  }
  if (entries.length) {
    out.push(`## ${file}`, ...entries, "");
  }
}

fs.writeFileSync(path.join(SUPPORT, "INDEX.md"), out.join("\n"));
console.log(`INDEX.md written (${out.length} lines)`);
