#!/usr/bin/env node
// One-time migration: rewrites the Jekyll-Liquid constructs in docs/**/*.md to
// plain Astro markdown, so the Astro build needs no Jekyll-emulation layer.
//
// Converts:
//   {% raw %} … {% endraw %}                       → tags removed (content kept;
//                                                     `{{ }}` is literal in .md)
//   {% include plans-blockquote.html feature="…" … %}
//                                                  → `> **Plans:** …` blockquote
//                                                     (styled .plans-callout via
//                                                     rehype-blockquote-classes)
//   {% include youtube.html id="…" %}              → <div class="youtube-embed">…</div>
//   {% include svg-icons/cross.svg %}              → ×  (was rendered empty before)
//   {{ page.version | remove: "v0." }}-stable      → {SAMPLE_APP_BRANCH}
//                                                     (resolved by remark-docs-version)
//
// Left untouched: {% include_file "…" %} — those are still expanded at build
// time by src/plugins/remark-include-file.mjs (the docs stay in sync with the
// type-checked SDK example sources / generated prop tables).
//
// Idempotent: a second run finds nothing to convert. Run from the repo root:
//   node bin/dejekyll-docs.mjs

import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.resolve(process.cwd(), "docs");

// ----- arg parsing for {% include … key=value key="value" %} -----

function parseArgs(s) {
  const args = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s%]+))/g;
  for (const m of s.matchAll(re)) {
    args[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return args;
}

// ----- plans-blockquote -----

function renderPlansCallout(argString) {
  const args = parseArgs(argString);
  const feature = args.feature || "This feature";
  const verb = args.is_plural === "true" ? "are" : "is";
  const enterpriseOnly = args["enterprise-only"] === "true";
  const selfHostedOnly = args["self-hosted-only"] === "true";
  // `sdk` / `convert_pro_link_to_embedding` point the Pro link at the embedded
  // analytics product page instead of the generic Pro page.
  const embeddingContext =
    args.sdk === "true" || args.convert_pro_link_to_embedding === "true";
  const proTarget = embeddingContext
    ? "https://www.metabase.com/product/embedded-analytics"
    : "/product/pro";

  const planLinks = enterpriseOnly
    ? `[**Enterprise**](/product/enterprise) plans`
    : `[**Pro**](${proTarget}) and [**Enterprise**](/product/enterprise) plans`;
  const hostingNote = selfHostedOnly
    ? " (self-hosted only)"
    : " (both self-hosted and on Metabase Cloud)";

  return `> **Plans:** ${feature} ${verb} only available on ${planLinks}${hostingNote}.`;
}

// ----- youtube -----

function renderYouTube(argString) {
  const args = parseArgs(argString);
  if (!args.id) return "";
  const id = encodeURIComponent(args.id);
  return (
    `<div class="youtube-embed"><iframe src="https://www.youtube.com/embed/${id}" ` +
    `title="YouTube video player" frameborder="0" ` +
    `allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ` +
    `allowfullscreen></iframe></div>`
  );
}

// ----- transforms -----

const RAW_OPEN_RE = /\{%-?\s*raw\s*-?%\}/g;
const RAW_CLOSE_RE = /\{%-?\s*endraw\s*-?%\}/g;
const PLANS_RE = /\{%\s*include\s+plans-blockquote\.html\s*([^%]*?)\s*%\}/g;
const YOUTUBE_RE = /\{%\s*include\s+youtube\.html\s*([^%]*?)\s*%\}/g;
const SVG_CROSS_RE = /\{%\s*include\s+svg-icons\/cross\.svg\s*%\}/g;
const PAGE_VERSION_RE =
  /\{\{\s*page\.version\s*\|\s*remove:\s*["']v0\.["']\s*\}\}-stable/g;

function convert(src) {
  const counts = { raw: 0, plans: 0, youtube: 0, svgCross: 0, pageVersion: 0 };
  let out = src;

  out = out.replace(RAW_OPEN_RE, () => (counts.raw++, ""));
  out = out.replace(RAW_CLOSE_RE, () => "");

  out = out.replace(PLANS_RE, (_m, argString) => {
    counts.plans++;
    return renderPlansCallout(argString);
  });

  out = out.replace(YOUTUBE_RE, (_m, argString) => {
    counts.youtube++;
    return renderYouTube(argString);
  });

  out = out.replace(SVG_CROSS_RE, () => (counts.svgCross++, "×"));

  out = out.replace(PAGE_VERSION_RE, () => (counts.pageVersion++, "{SAMPLE_APP_BRANCH}"));

  return { out, counts };
}

// ----- walk -----

function* markdownFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      yield* markdownFiles(abs);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield abs;
    }
  }
}

function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`dejekyll-docs: ${DOCS_DIR} not found — run from the repo root`);
    process.exit(1);
  }
  const totals = { files: 0, raw: 0, plans: 0, youtube: 0, svgCross: 0, pageVersion: 0 };
  for (const file of markdownFiles(DOCS_DIR)) {
    const src = fs.readFileSync(file, "utf8");
    const { out, counts } = convert(src);
    if (out !== src) {
      fs.writeFileSync(file, out);
      totals.files++;
      for (const k of Object.keys(counts)) totals[k] += counts[k];
      const parts = Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ");
      console.log(`  ${path.relative(process.cwd(), file)}  (${parts})`);
    }
  }
  console.log(
    `\n${totals.files} files changed — raw:${totals.raw} plans:${totals.plans} ` +
      `youtube:${totals.youtube} svg-cross:${totals.svgCross} page-version:${totals.pageVersion}`,
  );
}

main();
