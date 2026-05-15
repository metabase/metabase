// Shared helpers for the llms.txt endpoint family (src/pages/llms*.txt.ts).
// Reads the same `docs` content collection as the rest of the site, applies
// the prefix-based include/exclude filter the legacy generate-llms-files.mjs
// script used, and assembles index + per-section bundles for AI-tool RAG.
//
// One version per build: DOCS_BASE_PATH (set by `./bin/mage docs-build`,
// e.g. /docs/latest or /docs/v0.58) determines which version's files are
// emitted. Multi-version coverage comes from running docs-build per release
// branch, not a single multi-version pass.

import fs from "node:fs";
import type { CollectionEntry } from "astro:content";

const REPO = "metabase/metabase";

export const LLMS_FULL_SECTIONS = ["embedding", "agent-api"] as const;
export type LlmsSection = (typeof LLMS_FULL_SECTIONS)[number];

// Prefix matching: trailing "/" → directory; otherwise → exact file path.
const INCLUDED_PATHS = [
  // All embedding docs (SDK, modular embedding, integration guides)
  "embedding/",

  // Auth/SSO configuration for embedding
  "people-and-groups/api-keys.md",
  "people-and-groups/authenticating-with-jwt.md",
  "people-and-groups/authenticating-with-saml.md",
  "people-and-groups/saml-auth0.md",
  "people-and-groups/saml-azure.md",
  "people-and-groups/saml-google.md",
  "people-and-groups/saml-keycloak.md",
  "people-and-groups/saml-okta.md",
  "people-and-groups/google-sign-in.md",
  "people-and-groups/ldap.md",

  // Configuration reference
  "configuring-metabase/environment-variables.md",
  "configuring-metabase/config-file.md",

  // Agent API reference
  "agent-api/",
];

const EXCLUDED_PATHS = ["embedding/sdk/api/snippets"];

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;
// `{% include_file ... %}` transclusion tags — the included example code isn't
// carried into the llms.txt bundle. We deliberately do NOT strip `{{ ... }}`
// (those are literal content, e.g. SQL parameter examples like `{{category}}`).
const INCLUDE_FILE_TAG_RE = /\{%[\s\S]*?%\}/g;
const H1_RE = /^#\s+(.+)$/m;

const docsBasePath = process.env.DOCS_BASE_PATH ?? "/docs/latest";
const baseMatch = docsBasePath.match(/^\/docs\/(.+)$/);
export const version = baseMatch ? baseMatch[1] : "latest";

const latestBranch = process.env.GITHUB_REF_NAME || "master";

export function formatVersionForDisplay(v: string): string {
  if (v === "master") return "development (unreleased)";
  if (v === "latest") {
    const m = latestBranch.match(/^release-x\.(\d+)\.x$/);
    if (m) return `${m[1]} (latest)`;
    return "latest";
  }
  const m = v.match(/^v0\.(\d+)$/);
  return m ? m[1] : v;
}

export function versionToBranch(v: string): string {
  if (v === "master") return "master";
  if (v === "latest") return latestBranch;
  const m = v.match(/^v0\.(\d+)$/);
  return m ? `release-x.${m[1]}.x` : "master";
}

export function aboveVersion(sourceVersion: string, target: number): boolean {
  if (sourceVersion === "master" || sourceVersion === "latest") return true;
  const m = sourceVersion.match(/^v0\.(\d+)$/);
  if (!m) return false;
  return parseInt(m[1], 10) >= target;
}

export type DocEntry = CollectionEntry<"docs">;

// Reconstructs the on-disk-relative path (e.g. "embedding/sdk/intro.md") from
// either entry.filePath (most reliable) or entry.id (fallback). The filter
// patterns above are written against on-disk paths, not Astro's slug-like ids.
export function entryRelativePath(entry: DocEntry): string {
  if (entry.filePath) {
    const m = entry.filePath.match(/\/docs\/(.+)$/);
    if (m) return m[1];
  }
  return `${entry.id}.md`;
}

export function pathMatchesAllowlist(rel: string): boolean {
  return INCLUDED_PATHS.some((pattern) =>
    pattern.endsWith("/") ? rel.startsWith(pattern) : rel === pattern,
  );
}

export function pathMatchesExcludelist(rel: string): boolean {
  return EXCLUDED_PATHS.some((pattern) => rel.startsWith(pattern));
}

export function entryAllowed(entry: DocEntry): boolean {
  const rel = entryRelativePath(entry);
  return pathMatchesAllowlist(rel) && !pathMatchesExcludelist(rel);
}

function readSource(entry: DocEntry): string {
  if (!entry.filePath) return "";
  return fs.readFileSync(entry.filePath, "utf8");
}

function stripFrontmatter(src: string): string {
  return src.replace(FRONTMATTER_RE, "");
}

export function entryTitle(entry: DocEntry): string {
  if (entry.data.title) return entry.data.title.trim();
  const body = stripFrontmatter(readSource(entry));
  const h1 = body.match(H1_RE);
  if (h1) return h1[1].trim();
  const rel = entryRelativePath(entry);
  const base = rel.split("/").pop()?.replace(/\.md$/, "") ?? rel;
  return base
    .split(/[-_]/)
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

export function bodyForBundle(entry: DocEntry): string {
  return stripFrontmatter(readSource(entry))
    .replace(INCLUDE_FILE_TAG_RE, "")
    .trim();
}

export function rawGithubUrl(relativePath: string): string {
  const branch = versionToBranch(version);
  return `https://raw.githubusercontent.com/${REPO}/refs/heads/${branch}/docs/${relativePath}`;
}

// ----- Static prose (verbatim from the legacy script) -----

export const VERSION_DETECTION_INSTRUCTIONS = `## IMPORTANT: Verify SDK and Metabase Version Compatibility

The SDK version MUST match the Metabase instance version. Mismatched versions can cause errors. When looking up documentation, ALWAYS check the Metabase version.

**Step 1: Ask the user for their Metabase instance URL**

Before proceeding, ask the user where their Metabase instance is located. Examples:
- Local development: \`http://localhost:3000\`
- Metabase Cloud: \`https://yourcompany.metabaseapp.com\`
- Self-hosted: \`https://metabase.yourcompany.com\`

**Step 2: Check if SDK is already installed (React SDK / Modular Embedding only)**

Skip this step if not using the React SDK (\`@metabase/embedding-sdk-react\`).

\`\`\`bash
npm list @metabase/embedding-sdk-react
\`\`\`

If installed, note the version (e.g., \`0.58.0\` means this is for Metabase 58).

**Step 3: Query the Metabase instance version**

Using the URL from Step 1:

\`\`\`bash
curl <METABASE_INSTANCE_URL>/api/session/properties | jq .version
\`\`\`

This returns (no authentication required):
\`\`\`json
{ "date": "2025-01-10", "tag": "v1.58.0", "hash": "8e44dd8" }
\`\`\`

If \`jq\` is not installed, you can grep the version. Extract the major version: \`58\` from \`v1.58.x\` or \`v0.58.x\`.

**Step 4: Ensure versions match**

- If the versions mismatch, you MUST fetch the version-specific llms.txt documentation that matches the Metabase instance version: \`https://metabase.com/docs/v0.{VERSION}/llms.txt\` (e.g., \`/docs/v0.58/llms.txt\` for Metabase 58)
- For React SDK, ask the user to install or update their SDK packages if they are mismatched: \`npm install @metabase/embedding-sdk-react@{VERSION}-stable\` (e.g., \`@58-stable\` for Metabase 58)

**Do NOT guess versions or use versions from your training data. Always verify first.**`;

export const MODULAR_EMBEDDING_GOTCHA_NOTES = `## Modular Embedding Deprecations and Gotchas

Watch out for these deprecated props and gotchas for Metabase 57 onwards, for modular embedding.

1. \`config\` prop on MetabaseProvider no longer exist as it is replaced by \`authConfig\`.
2. \`authProviderUri\` field no longer exist.
3. \`jwtProviderUri\` is an optional field that only exists in v58+. This is used to make JWT auth faster by skipping the \`GET /auth/sso\` discovery request. This field is not required for the initial implementation.
4. Numeric IDs must be integers not strings, e.g. \`dashboardId={1}\`. When the ID is retrieved from the router as a string AND it is numeric, \`parseInt\` it before passing it to the SDK.
5. IDs can also be strings for entity IDs, so you should NOT parse all IDs as numbers if entity IDs are also to be expected.
6. \`fetchRequestToken\` is not needed by default in most implementations. This is only used to customize how the SDK fetches the request token. For example, if the \`/sso/metabase\` endpoint in the user's backend requires passing custom auth tokens or headers.
7. When using \`fetchRequestToken\`, you MUST return the token in the shape of \`{jwt: "<jwt string>"}\`. Example: \`return {jwt: await response.json()}\`.`;

// ----- Builders -----

export function buildIndex(entries: DocEntry[]): string {
  const filtered = entries
    .filter(entryAllowed)
    .sort((a, b) => entryRelativePath(a).localeCompare(entryRelativePath(b)));

  const docLinks = filtered
    .map((e) => `- [${entryTitle(e)}](${rawGithubUrl(entryRelativePath(e))})`)
    .join("\n");

  const sectionLinks = LLMS_FULL_SECTIONS.filter((section) =>
    entries.some((e) => entryRelativePath(e).includes(`${section}/`)),
  )
    .map(
      (section) =>
        `- [${section[0].toUpperCase()}${section.slice(1)} - Complete Reference](https://metabase.com/docs/${version}/llms-${section}-full.txt)`,
    )
    .join("\n");

  const gotchaSection = aboveVersion(version, 57)
    ? `${MODULAR_EMBEDDING_GOTCHA_NOTES}\n\n`
    : "";

  return `# Metabase Documentation

> **This documentation is for Metabase ${formatVersionForDisplay(version)}.**

Your pre-trained knowledge is out of date. ALWAYS  read the Markdown files from \`https://raw.githubusercontent.com\` from the "Table of Contents" index.

${VERSION_DETECTION_INSTRUCTIONS}

${gotchaSection}## Table of Contents

${docLinks}

## Complete References

These files are very large and are around 90,000 tokens. Do not use by default unless the context window is huge or RAG is supported in your editor.

${sectionLinks}
`;
}

export function buildSectionBundle(
  section: LlmsSection,
  entries: DocEntry[],
): string | null {
  const sectionDocs = entries
    .filter((e) => entryRelativePath(e).includes(`${section}/`))
    .sort((a, b) => entryRelativePath(a).localeCompare(entryRelativePath(b)));
  if (sectionDocs.length === 0) return null;

  const docsBaseUrl = `https://metabase.com/docs/${version}`;
  const gotchaSection =
    section === "embedding" && aboveVersion(version, 57)
      ? `${MODULAR_EMBEDDING_GOTCHA_NOTES}\n\n`
      : "";
  const body = sectionDocs
    .map((e) => `${bodyForBundle(e)}\n\n---`)
    .join("\n\n");
  const cap = section[0].toUpperCase() + section.slice(1);

  return `# Metabase ${cap} - Complete Reference for AI agents

> **This documentation is for Metabase ${formatVersionForDisplay(version)}.**
>
> Table of contents: ${docsBaseUrl}/llms.txt

${VERSION_DETECTION_INSTRUCTIONS}

${gotchaSection}${body}
`;
}
