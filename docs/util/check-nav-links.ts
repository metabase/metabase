#!/usr/bin/env bun
/**
 * Verifies that every `url` in docs/util/data/nav.yml points at a real page
 * under docs/, and that any `#anchor` exists in the target markdown file.
 *
 * Run from anywhere in the repo:
 *
 *   bun docs/util/check-nav-links.ts
 *
 * Uses Bun's built-in YAML parser (Bun >= 1.2.21), so no dependencies need
 * to be installed. Exits 1 if any problem is found.
 *
 * URL handling:
 *   - `https://...` and other scheme URLs are skipped (external).
 *   - `/learn/...` style leading-slash URLs are site pages outside this repo
 *     and are skipped.
 *   - Everything else is relative to docs/ and must resolve to one of
 *     <url>.md, <url>/index.md, <url>.html, or <url>/index.html.
 *
 * When a page is missing, the script looks for a `redirect_from` frontmatter
 * entry matching `/docs/latest/<url>` elsewhere in docs/ and suggests it.
 *
 * Anchors are checked with GitHub-style heading slugs plus explicit
 * `{#custom-id}` (kramdown) and `id="..."` / `name="..."` attributes. The
 * live docs site is built with Jekyll/kramdown, whose automatic ids differ
 * from GitHub's for headings that start with digits or punctuation. If a
 * heading like that needs to be linked from the nav, give it an explicit
 * `{#id}` suffix, which both kramdown and this script honor.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

declare const Bun: { YAML?: { parse(text: string): unknown } };

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS_DIR = path.join(REPO_ROOT, "docs");
const NAV_FILE = path.join(DOCS_DIR, "util", "data", "nav.yml");
const NAV_FILE_REL = path.relative(REPO_ROOT, NAV_FILE);

interface NavNode {
  name: string;
  url?: string;
  pages?: NavNode[];
}

interface Problem {
  kind: "MISSING" | "ANCHOR" | "INVALID" | "STRUCTURE";
  url?: string;
  trail: string;
  line?: number;
  details: string[];
}

interface Resolved {
  file: string;
  kind: "md" | "html";
}

const stats = { checked: 0, resolved: 0, skipped: 0 };
const problems: Problem[] = [];
let navText = "";

function main() {
  if (typeof Bun?.YAML?.parse !== "function") {
    console.error("check-nav-links: requires bun >= 1.2.21 (Bun.YAML is not available)");
    process.exit(1);
  }

  navText = fs.readFileSync(NAV_FILE, "utf-8");

  let nav: unknown;
  try {
    nav = Bun.YAML.parse(navText);
  } catch (e) {
    console.error(`${NAV_FILE_REL}: failed to parse YAML: ${(e as Error).message}`);
    process.exit(1);
  }

  if (!isRecord(nav) || Array.isArray(nav) || !Array.isArray(nav.categories)) {
    console.error(`${NAV_FILE_REL}: expected a single document with a top-level \`categories\` list`);
    process.exit(1);
  }

  walkList(nav.categories, "");
  report();
  process.exit(problems.length > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Walking the nav tree
// ---------------------------------------------------------------------------

function walkList(nodes: unknown[], trail: string) {
  for (const node of nodes) {
    walk(node, trail);
  }
}

function walk(node: unknown, parentTrail: string) {
  if (!isRecord(node) || Array.isArray(node)) {
    problems.push({
      kind: "STRUCTURE",
      trail: parentTrail || "(top level)",
      details: [`entry is not a map: ${JSON.stringify(node)}`],
    });
    return;
  }

  const name = typeof node.name === "string" && node.name.trim() ? node.name : undefined;
  const trail = parentTrail ? `${parentTrail} > ${name ?? "(unnamed)"}` : name ?? "(unnamed)";

  if (!name) {
    problems.push({ kind: "STRUCTURE", trail, details: ["entry has no `name`"] });
  }

  const hasUrl = "url" in node;
  const hasPages = "pages" in node;

  if (!hasUrl && !hasPages) {
    problems.push({
      kind: "STRUCTURE",
      trail,
      line: findLine(`name: "${name}"`) ?? findLine(`name: ${name}`),
      details: ["entry has neither `url` nor `pages`"],
    });
  }

  if (hasUrl) {
    if (typeof node.url !== "string") {
      problems.push({
        kind: "STRUCTURE",
        trail,
        details: [`\`url\` must be a string, got ${JSON.stringify(node.url)}`],
      });
    } else {
      checkUrl(node.url, trail);
    }
  }

  if (hasPages) {
    if (!Array.isArray(node.pages)) {
      problems.push({ kind: "STRUCTURE", trail, details: ["`pages` must be a list"] });
    } else {
      walkList(node.pages, trail);
    }
  }
}

// ---------------------------------------------------------------------------
// URL checking
// ---------------------------------------------------------------------------

function checkUrl(url: string, trail: string) {
  stats.checked++;
  const line = findLine(`url: "${url}"`) ?? findLine(`url: ${url}`);

  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    stats.skipped++; // external, e.g. https://www.metabase.com/...
    return;
  }
  if (url.startsWith("/")) {
    stats.skipped++; // metabase.com site page outside this repo, e.g. /learn/...
    return;
  }

  const hashCount = url.split("#").length - 1;
  if (!url || url.includes("..") || url.includes("\\") || url.includes("?") || hashCount > 1) {
    problems.push({
      kind: "INVALID",
      url,
      trail,
      line,
      details: ["url must be a docs-relative path with at most one `#anchor`, no `..`, `?`, or `\\`"],
    });
    return;
  }

  const [pagePath, anchor] = splitAnchor(url);
  const candidates = candidateFiles(pagePath);
  const resolved = resolveFile(candidates);

  if (!resolved) {
    problems.push({
      kind: "MISSING",
      url,
      trail,
      line,
      details: [
        `tried: ${candidates.map(relToRepo).join(", ")}`,
        suggestionFor(pagePath, anchor),
      ],
    });
    return;
  }

  const caseProblem = caseMismatch(resolved.file);
  if (caseProblem) {
    problems.push({ kind: "INVALID", url, trail, line, details: [caseProblem] });
    return;
  }

  if (anchor !== undefined && resolved.kind === "md") {
    const anchors = collectAnchors(fs.readFileSync(resolved.file, "utf-8"));
    if (!anchors.has(anchor)) {
      problems.push({
        kind: "ANCHOR",
        url,
        trail,
        line,
        details: [`anchor #${anchor} not found in ${relToRepo(resolved.file)}`],
      });
      return;
    }
  }

  stats.resolved++;
}

function splitAnchor(url: string): [string, string | undefined] {
  const i = url.indexOf("#");
  return i === -1 ? [url, undefined] : [url.slice(0, i), url.slice(i + 1)];
}

function candidateFiles(pagePath: string): string[] {
  const base = path.join(DOCS_DIR, pagePath);
  if (pagePath.endsWith("/")) {
    return [path.join(base, "index.md"), path.join(base, "index.html")];
  }
  return [`${base}.md`, path.join(base, "index.md"), `${base}.html`, path.join(base, "index.html")];
}

function resolveFile(candidates: string[]): Resolved | undefined {
  for (const file of candidates) {
    if (isFile(file)) {
      return { file, kind: file.endsWith(".md") ? "md" : "html" };
    }
  }
  return undefined;
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** macOS filesystems are case-insensitive; the docs site (and CI) are not. */
function caseMismatch(file: string): string | undefined {
  const real = fs.realpathSync.native(file);
  const wanted = path.resolve(file);
  if (real !== wanted) {
    return `case mismatch: url resolves to ${relToRepo(real)} on a case-insensitive filesystem but will 404 on the docs site`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

function collectAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let inFence = false;

  for (const rawLine of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = /^#{1,6}\s+(.+?)\s*#*$/.exec(rawLine);
    if (!m) continue;

    let text = m[1];
    const custom = /\{#([^}\s]+)\}\s*$/.exec(text);
    if (custom) {
      anchors.add(custom[1]);
      text = text.slice(0, custom.index);
    }

    const slug = githubSlug(text);
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    anchors.add(n === 0 ? slug : `${slug}-${n}`);
  }

  // Explicit ids anywhere in the file, e.g. <a id="foo"></a> or <h2 id="bar">.
  // [^>]* deliberately spans newlines: some snippet files break the tag across lines.
  const idRe = /<(?:a|h[1-6]|div|span|section)\b[^>]*?\b(?:id|name)="([^"]+)"/g;
  let idMatch: RegExpExecArray | null;
  while ((idMatch = idRe.exec(markdown))) {
    anchors.add(idMatch[1]);
  }

  return anchors;
}

function githubSlug(headingText: string): string {
  return headingText
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

// ---------------------------------------------------------------------------
// redirect_from suggestions
// ---------------------------------------------------------------------------

let redirectIndex: Map<string, string[]> | undefined;

function suggestionFor(pagePath: string, anchor: string | undefined): string {
  const key = pagePath.replace(/\/$/, "");
  const files = redirects().get(key) ?? [];
  if (files.length === 0) {
    return `no redirect_from matches /docs/latest/${key}; the page may have been deleted, so remove the entry or point it elsewhere`;
  }
  return files
    .map((file) => {
      const newUrl = fileToNavUrl(file) + (anchor !== undefined ? `#${anchor}` : "");
      return `suggestion: url: "${newUrl}"  (redirect_from in ${relToRepo(file)})`;
    })
    .join("\n");
}

function redirects(): Map<string, string[]> {
  if (redirectIndex) return redirectIndex;
  redirectIndex = new Map();

  const entries = fs.readdirSync(DOCS_DIR, { recursive: true, encoding: "utf-8" }) as string[];
  for (const rel of entries) {
    if (!rel.endsWith(".md")) continue;
    if (rel.split(path.sep).includes("node_modules")) continue;

    const file = path.join(DOCS_DIR, rel);
    if (!isFile(file)) continue;

    const frontmatter = readFrontmatter(file);
    if (!frontmatter) continue;

    const re = /^(?:redirect_from:|\s*-)\s*["']?(\/docs\/latest\/[^\s"']+)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(frontmatter))) {
      const key = m[1].replace(/^\/docs\/latest\//, "").replace(/\/$/, "");
      const list = redirectIndex.get(key) ?? [];
      list.push(file);
      redirectIndex.set(key, list);
    }
  }
  return redirectIndex;
}

function readFrontmatter(file: string): string | undefined {
  const text = fs.readFileSync(file, "utf-8");
  if (!text.startsWith("---\n")) return undefined;
  const end = text.indexOf("\n---", 4);
  return end === -1 ? undefined : text.slice(4, end);
}

function fileToNavUrl(file: string): string {
  const rel = path.relative(DOCS_DIR, file).split(path.sep).join("/");
  if (rel.endsWith("/index.md")) return rel.slice(0, -"index.md".length);
  return rel.replace(/\.md$/, "");
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report() {
  for (const p of problems) {
    const where = p.line !== undefined ? `${NAV_FILE_REL}:${p.line}` : NAV_FILE_REL;
    console.log(`${p.kind.padEnd(9)}${p.url ?? ""}`);
    console.log(`         at: ${p.trail}  (${where})`);
    for (const d of p.details) {
      for (const dl of d.split("\n")) console.log(`         ${dl}`);
    }
    console.log();

    if (process.env.GITHUB_ACTIONS) {
      const msg = [`${p.kind} ${p.url ?? ""} at ${p.trail}`, ...p.details].join(" | ");
      const lineAttr = p.line !== undefined ? `,line=${p.line}` : "";
      console.log(`::error file=${NAV_FILE_REL}${lineAttr}::${escapeAnnotation(msg)}`);
    }
  }

  console.log(
    `Checked ${stats.checked} nav urls: ${stats.resolved} resolved, ` +
      `${stats.skipped} skipped (external/site-absolute), ${problems.length} problem${problems.length === 1 ? "" : "s"}`,
  );
}

function escapeAnnotation(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function relToRepo(file: string): string {
  return path.relative(REPO_ROOT, file);
}

/** Bun.YAML has no source positions, so locate the first raw line containing the needle. */
function findLine(needle: string): number | undefined {
  const lines = navText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return undefined;
}

main();
