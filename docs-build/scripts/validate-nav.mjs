#!/usr/bin/env node
// Validates that every page URL referenced in `nav.yml` resolves to either
// a markdown file under `docs/` or a known virtual route. Run by
// `bun run docs:check` so typo'd slugs fail at check-time rather than
// silently disappearing from the sidebar at runtime.
//
// Resolution rules, in order:
//   - http(s):// or //  — external. Skipped.
//   - starts with "/"   — site-absolute (e.g. /learn/..., /paid-features/).
//                          Skipped (not under DOCS_BASE_PATH).
//   - contains "#"      — strip the fragment; we don't validate heading IDs.
//   - trailing "/"      — directory route, resolve as <slug>/index.md.
//   - VIRTUAL_ROUTES    — routes served by an Astro page or generated HTML,
//                          not by a `docs/*.md` file. See list below.
//   - otherwise         — resolve as `docs/<slug>.md`, falling back to
//                          `docs/<slug>/index.md`.
//
// Exit code 1 on any unresolved reference; prints the offending slug,
// the originating nav category, and the breadcrumb trail.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_BUILD_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DOCS_BUILD_DIR, "..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const NAV_PATH = path.join(DOCS_BUILD_DIR, "nav.yml");

// Routes served by an Astro page or a generated HTML directory rather than
// by a `docs/*.md` file. Keep this list short and explicit so additions are
// deliberate.
const VIRTUAL_ROUTES = new Set([
  // src/pages/api.astro — Scalar viewer over docs/api.json.
  "api",
  // docs-build/public/embedding/sdk/api/index.html — typedoc-generated.
  "embedding/sdk/api",
]);

function isExternalOrAbsolute(url) {
  return /^https?:\/\//.test(url) || url.startsWith("//") || url.startsWith("/");
}

function stripFragment(url) {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

function resolveSlug(slug) {
  // Treat `foo/` (trailing slash) as `foo/index.md`.
  const hadTrailingSlash = slug.endsWith("/");
  const bare = hadTrailingSlash ? slug.slice(0, -1) : slug;

  if (VIRTUAL_ROUTES.has(bare)) return { kind: "virtual", target: bare };

  const candidates = hadTrailingSlash
    ? [path.join(DOCS_DIR, bare, "index.md")]
    : [path.join(DOCS_DIR, `${bare}.md`), path.join(DOCS_DIR, bare, "index.md")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { kind: "file", target: candidate };
  }

  return { kind: "missing", candidates };
}

function* walk(pages, trail) {
  for (const page of pages ?? []) {
    const here = [...trail, page.name];
    if (page.url) yield { url: page.url, trail: here };
    if (page.pages) yield* walk(page.pages, here);
  }
}

function main() {
  const navYaml = fs.readFileSync(NAV_PATH, "utf8");
  const nav = yaml.load(navYaml);

  const checked = [];
  const unresolved = [];

  for (const category of nav.categories ?? []) {
    for (const ref of walk(category.pages, [category.name])) {
      const { url, trail } = ref;
      if (isExternalOrAbsolute(url)) continue;

      const slug = stripFragment(url);
      // Pure fragments inside the current page aren't valid in a nav URL —
      // skip them defensively rather than crashing.
      if (!slug) continue;

      const resolution = resolveSlug(slug);
      checked.push({ url, slug, trail, resolution });
      if (resolution.kind === "missing") unresolved.push({ url, slug, trail, resolution });
    }
  }

  const total = checked.length;
  if (unresolved.length === 0) {
    console.log(`nav.yml: ${total} page references resolve OK.`);
    return;
  }

  console.error(`nav.yml: ${unresolved.length} of ${total} page references do not resolve:\n`);
  for (const { url, trail, resolution } of unresolved) {
    const breadcrumb = trail.join(" → ");
    console.error(`  ✗ ${url}`);
    console.error(`      in: ${breadcrumb}`);
    console.error(`      looked for:`);
    for (const c of resolution.candidates) {
      console.error(`        - ${path.relative(REPO_ROOT, c)}`);
    }
    console.error("");
  }
  console.error("Fix by either correcting the slug in docs-build/nav.yml,");
  console.error("creating the missing markdown file under docs/, or — if this is a");
  console.error("route served by src/pages/*.astro or generated HTML — adding it to");
  console.error("VIRTUAL_ROUTES in docs-build/scripts/validate-nav.mjs.");
  process.exit(1);
}

main();
