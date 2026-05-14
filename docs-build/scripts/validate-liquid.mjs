#!/usr/bin/env node
// Scans docs/ for Jekyll/Liquid-era tokens that would render as literal
// text under the Astro build. Exits 1 if any are found.
//
// What we flag:
//   - `{% ... %}` tags that are NOT `{% include_file ... %}` (the one
//     transclusion construct the build deliberately supports).
//   - `{{ site.X }}` and `{{ page.X }}` interpolations — these are the
//     Jekyll-namespaced patterns. We do NOT flag bare `{{ ... }}` because
//     it's now legitimate content (e.g. SQL parameter examples like
//     `{{category}}` and Mustache snippets in some embedding docs).
//
// We DO scan inside fenced code blocks for `{% ... %}` because the
// include_file plugin processes those too. We skip the file frontmatter
// (the `---\n...\n---` header) since YAML can't contain Liquid anyway.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");

const FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n/;
// Match `{% TAG ... %}` and capture TAG, then filter out the allowed
// transclusion tag in code. (A lookahead-based exclusion is fragile here
// because regex backtracking over `\s*` lets the engine slip past
// `include_file` and still match.)
const TAG_RE = /\{%\s*([\w-]+)\b([^%]*)%\}/g;
const ALLOWED_TAGS = new Set(["include_file"]);

// Mask inline code spans and fenced code blocks so illustrative
// references to Liquid syntax (e.g. `{% for x in y %}` in the chrome-
// resync instructions) don't trip the scanner. We replace the masked
// content with whitespace of the same length so line numbers stay stable.
function maskCode(text) {
  // Fenced code blocks. ``` or ~~~ open/close, plus an optional info string.
  let out = text.replace(/(^|\n)(```|~~~)[\w-]*\n[\s\S]*?\n\2(?=\n|$)/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
  // Inline code spans. Backtick runs, may include backticks of a different
  // run length. The common case (single backtick) covers >99% of docs.
  out = out.replace(/`+[^`\n]*?`+/g, (m) => m.replace(/[^\n]/g, " "));
  return out;
}
// Site/page interpolations — the namespaces Jekyll exposed in its
// template scope. Flagging only these (instead of all `{{ ... }}`)
// keeps the SQL/Mustache content false-positive-free.
const JEKYLL_VAR_RE = /\{\{\s*(site|page)\.[\w.]+(?:\s*\|[^}]*)?\s*\}\}/g;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(abs);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield abs;
    }
  }
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

const violations = [];
for (const abs of walk(DOCS_DIR)) {
  const raw = fs.readFileSync(abs, "utf8");
  // Skip the YAML frontmatter so a `redirect_from:` entry that mentions
  // `{{` (very unlikely, but safe) wouldn't false-positive.
  const fmMatch = raw.match(FRONTMATTER_RE);
  const offset = fmMatch ? fmMatch[0].length : 0;
  const text = maskCode(raw.slice(offset));
  const rel = path.relative(REPO_ROOT, abs);

  for (const m of text.matchAll(TAG_RE)) {
    if (ALLOWED_TAGS.has(m[1])) continue;
    violations.push({
      file: rel,
      line: lineOf(text, m.index) + (fmMatch ? raw.slice(0, offset).split("\n").length - 1 : 0),
      kind: "stray-tag",
      sample: m[0],
    });
  }
  for (const m of text.matchAll(JEKYLL_VAR_RE)) {
    violations.push({
      file: rel,
      line: lineOf(text, m.index) + (fmMatch ? raw.slice(0, offset).split("\n").length - 1 : 0),
      kind: "jekyll-var",
      sample: m[0],
    });
  }
}

if (violations.length === 0) {
  console.log("validate-liquid: no stray Liquid tokens in docs/.");
  process.exit(0);
}

console.error(`validate-liquid: ${violations.length} Liquid token(s) found:`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line} [${v.kind}] ${v.sample}`);
}
console.error("");
console.error("Allowed: `{% include_file \"path\" %}` (transclusion).");
console.error("Disallowed: any other `{% ... %}`, and `{{ site.X }}` / `{{ page.X }}`.");
process.exit(1);
