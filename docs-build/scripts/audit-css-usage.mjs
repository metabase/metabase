#!/usr/bin/env node
// audit-css-usage.mjs
//
// Cross-references the class selectors defined in chrome.css against the
// class names actually used in src/data/{header,footer}.html and the
// classList manipulations in public/js/*.js. Prints orphan selectors —
// selectors whose required classes are nowhere in the marketing HTML or
// the chrome JS, so they can't possibly match anything at render time.
//
// Heuristic, not authoritative: a selector is flagged when AT LEAST ONE
// of its required class names is missing from the union of HTML/JS class
// sets. Manual review before deleting is required — pseudo-state classes
// (e.g. `.open`, `.active`, `.hidden`) added via Astro components or
// public/js scripts can be missed if the call site uses string templates.
//
// Run: node docs-build/scripts/audit-css-usage.mjs
//
// Re-run after any header.html / footer.html refresh from marketing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsBuildDir = path.resolve(__dirname, "..");

const HEADER_HTML = path.join(docsBuildDir, "src/data/header.html");
const FOOTER_HTML = path.join(docsBuildDir, "src/data/footer.html");
const CHROME_CSS = path.join(docsBuildDir, "src/styles/chrome.css");
const PUBLIC_JS_DIR = path.join(docsBuildDir, "public/js");
const COMPONENTS_DIR = path.join(docsBuildDir, "src/components");
const LAYOUTS_DIR = path.join(docsBuildDir, "src/layouts");

// Static class attribute: class="foo bar". Astro components also use
// template-literal forms class={`foo ${x}`} — those we pick up via the
// fallback CLASS_TEMPLATE_RE below.
const CLASS_ATTR_RE = /class\s*=\s*"([^"]+)"/g;
// Astro: class={`foo bar ...`} / class:list={[`foo`, `bar`]}.
const CLASS_TEMPLATE_RE = /class(?::list)?\s*=\s*\{[^}]*?[`"']([^`"']+)[`"']/g;
// classList.add('foo'), classList.remove("bar"), classList.toggle(`baz`)
const CLASS_LIST_RE =
  /classList\.(?:add|remove|toggle|replace)\s*\(\s*(["'`])([^"'`]+)\1/g;
// className = "foo bar", className += " baz"
const CLASSNAME_RE = /className\s*[+]?=\s*(["'`])([^"'`]+)\1/g;
// setAttribute("class", "foo bar")
const SETATTR_RE =
  /setAttribute\s*\(\s*["']class["']\s*,\s*(["'`])([^"'`]+)\1/g;

// In each CSS rule's selector, extract simple class names. We deliberately
// strip pseudo-classes / pseudo-elements / combinators / attribute selectors
// because they don't change which class identifiers the selector depends on.
const CLASS_NAME_IN_SELECTOR_RE = /\.([A-Za-z_][\w-]*)/g;

function collectClassesFromHtml(htmlPath) {
  if (!fs.existsSync(htmlPath)) return new Set();
  const src = fs.readFileSync(htmlPath, "utf8");
  const out = new Set();
  for (const m of src.matchAll(CLASS_ATTR_RE)) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls) out.add(cls);
    }
  }
  return out;
}

function collectClassesFromAstro(dir) {
  const out = new Set();
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".astro")) continue;
    const src = fs.readFileSync(path.join(dir, entry.name), "utf8");
    const extract = (re, group) => {
      for (const m of src.matchAll(re)) {
        for (const cls of m[group].split(/\s+/)) {
          if (cls) out.add(cls);
        }
      }
    };
    extract(CLASS_ATTR_RE, 1);
    extract(CLASS_TEMPLATE_RE, 1);
  }
  return out;
}

function collectClassesFromJs(dir) {
  const out = new Set();
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const src = fs.readFileSync(path.join(dir, entry.name), "utf8");
    const extract = (re) => {
      for (const m of src.matchAll(re)) {
        for (const cls of m[2].split(/\s+/)) {
          if (cls) out.add(cls);
        }
      }
    };
    extract(CLASS_LIST_RE);
    extract(CLASSNAME_RE);
    extract(SETATTR_RE);
  }
  return out;
}

// A simple CSS selector parser: pulls each selector group out of the
// stylesheet along with its line number. Skips at-rules' brace blocks at the
// top level (Bootstrap's nested media queries — we still get the inner
// selectors via the outer pass). Doesn't try to be a full CSS parser; the
// chrome.css here is mostly Bootstrap-extracted minified output plus
// hand-written rules.
function parseSelectors(cssPath) {
  const src = fs.readFileSync(cssPath, "utf8");
  const lines = src.split("\n");
  const results = []; // { lineNum, selectorText, classes: string[] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines and at-rules with no selector body.
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("@")) continue;
    // Find the first `{` and treat everything before it as the selector
    // group for this line. Rules in chrome.css are mostly single-line.
    const braceIdx = line.indexOf("{");
    if (braceIdx < 0) continue;
    const selectorText = line.slice(0, braceIdx).trim();
    if (!selectorText) continue;
    // Split the comma-separated selector group; each piece is one selector.
    for (const sel of selectorText.split(",")) {
      const cleaned = sel.trim();
      if (!cleaned) continue;
      const classes = [];
      for (const m of cleaned.matchAll(CLASS_NAME_IN_SELECTOR_RE)) {
        classes.push(m[1]);
      }
      // Rules with no class selector (pure tag / id) — not our concern.
      if (classes.length === 0) continue;
      results.push({ lineNum: i + 1, selectorText: cleaned, classes });
    }
  }
  return results;
}

function main() {
  const htmlClasses = new Set([
    ...collectClassesFromHtml(HEADER_HTML),
    ...collectClassesFromHtml(FOOTER_HTML),
  ]);
  const astroClasses = new Set([
    ...collectClassesFromAstro(COMPONENTS_DIR),
    ...collectClassesFromAstro(LAYOUTS_DIR),
  ]);
  const jsClasses = collectClassesFromJs(PUBLIC_JS_DIR);
  const allKnown = new Set([
    ...htmlClasses,
    ...astroClasses,
    ...jsClasses,
  ]);

  console.log(
    `Loaded ${htmlClasses.size} classes from HTML + ${astroClasses.size} from .astro + ${jsClasses.size} from JS (${allKnown.size} total unique)`,
  );

  const selectors = parseSelectors(CHROME_CSS);
  console.log(`Parsed ${selectors.length} class-bearing CSS selectors`);
  console.log("");

  // Group orphans by their "missing class" to make the prune more navigable.
  const orphansByMissingClass = new Map();
  let orphanCount = 0;
  for (const { lineNum, selectorText, classes } of selectors) {
    const missing = classes.filter((c) => !allKnown.has(c));
    if (missing.length === 0) continue;
    orphanCount++;
    // Attribute to the FIRST missing class — that's the primary "kill it"
    // signal. A selector with two missing classes is doubly orphan but the
    // grouping doesn't need to be more nuanced than that for the audit.
    const key = missing[0];
    if (!orphansByMissingClass.has(key)) orphansByMissingClass.set(key, []);
    orphansByMissingClass
      .get(key)
      .push({ lineNum, selectorText, missing });
  }

  // Sort by descending hit count so the heavy hitters surface first.
  const sorted = [...orphansByMissingClass.entries()].sort(
    ([, a], [, b]) => b.length - a.length,
  );

  console.log(
    `Found ${orphanCount} orphan selectors across ${sorted.length} distinct missing classes:`,
  );
  console.log("");

  for (const [missingClass, hits] of sorted) {
    console.log(`.${missingClass}  (${hits.length} selector${hits.length === 1 ? "" : "s"})`);
    for (const { lineNum, selectorText } of hits.slice(0, 5)) {
      console.log(`    chrome.css:${lineNum}  ${selectorText}`);
    }
    if (hits.length > 5) {
      console.log(`    ... ${hits.length - 5} more`);
    }
  }

  if (orphanCount === 0) {
    console.log("(no orphan selectors — every CSS class is referenced)");
  }
}

main();
