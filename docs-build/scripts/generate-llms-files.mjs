#!/usr/bin/env node
// Generates llms.txt (index) and llms-{section}-full.txt (concatenated
// section reference) artifacts for the current build's version, writing
// them next to the Astro output in docs-build/dist/.
//
// Near-mechanical port of the Jekyll plugin
// docs.metabase.github.io/_plugins/jekyll_generate_llms_files_plugin.rb.
//
// One key difference: the Jekyll plugin iterated over every checked-in doc
// version. The Astro build produces a single version per run (controlled by
// DOCS_BASE_PATH, e.g. /docs/latest or /docs/v0.58), so this script writes
// one set of files per build.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "metabase/metabase";

// Sections to generate llms-{section}-full.txt for.
// These huge files are used by AI tools like Cursor for RAG chunking and indexing.
const LLMS_FULL_TO_GENERATE = ["embedding", "agent-api"];

// Paths to include in llms.txt generation. Prefix matching:
//   - trailing "/" matches by prefix (any file under the directory)
//   - no trailing "/" matches the exact relative path
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
const LIQUID_TAG_RE = /\{%[\s\S]*?%\}/g;
const LIQUID_VAR_RE = /\{\{[\s\S]*?\}\}/g;
const FRONTMATTER_TITLE_RE = /^title\s*:\s*(.+?)\s*$/m;
const H1_RE = /^#\s+(.+)$/m;

const OUTPUT_FILE = "llms.txt";

// ----- Path/version resolution -----

const __filename = fileURLToPath(import.meta.url);
const docsBuildDir = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(docsBuildDir, "..");
const docsSourceDir = path.join(repoRoot, "docs");
const distDir = path.join(docsBuildDir, "dist");

// DOCS_BASE_PATH is set by bin/build-docs.sh: /docs/latest or /docs/v0.NN.
const docsBasePath = process.env.DOCS_BASE_PATH ?? "/docs/latest";
const baseMatch = docsBasePath.match(/^\/docs\/(.+)$/);
const version = baseMatch ? baseMatch[1] : "latest";

// GITHUB_REF_NAME is the branch the build is running against. For "latest"
// builds we need it to format the display string ("58 (latest)") and pick
// the correct raw.githubusercontent ref.
const latestBranch = process.env.GITHUB_REF_NAME || "master";

// ----- Helpers -----

function formatVersionForDisplay(v) {
  if (v === "master") return "development (unreleased)";
  if (v === "latest") {
    const m = latestBranch.match(/^release-x\.(\d+)\.x$/);
    if (m) return `${m[1]} (latest)`;
    return "latest";
  }
  const m = v.match(/^v0\.(\d+)$/);
  return m ? m[1] : v;
}

function versionToBranch(v) {
  if (v === "master") return "master";
  if (v === "latest") return latestBranch;
  const m = v.match(/^v0\.(\d+)$/);
  return m ? `release-x.${m[1]}.x` : "master";
}

function aboveVersion(sourceVersion, target) {
  if (sourceVersion === "master" || sourceVersion === "latest") return true;
  const m = sourceVersion.match(/^v0\.(\d+)$/);
  if (!m) return false;
  return parseInt(m[1], 10) >= target;
}

function pathMatchesAllowlist(rel) {
  return INCLUDED_PATHS.some((pattern) =>
    pattern.endsWith("/") ? rel.startsWith(pattern) : rel === pattern,
  );
}

function pathMatchesExcludelist(rel) {
  return EXCLUDED_PATHS.some((pattern) => rel.startsWith(pattern));
}

function listMarkdownFiles(dir, relBase = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listMarkdownFiles(abs, rel));
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
      out.push({ absolutePath: abs, relativePath: rel });
    }
  }
  return out;
}

function readSourceFile(absolutePath) {
  return fs.readFileSync(absolutePath, "utf8");
}

function extractFrontmatterField(content, fieldRe) {
  const fm = content.match(FRONTMATTER_RE);
  if (!fm) return null;
  const m = fm[1].match(fieldRe);
  if (!m) return null;
  // Strip surrounding quotes if the YAML value is quoted.
  return m[1].replace(/^["'](.*)["']$/, "$1").trim();
}

function extractTitle(absolutePath, relativePath) {
  const content = readSourceFile(absolutePath);
  const fmTitle = extractFrontmatterField(content, FRONTMATTER_TITLE_RE);
  if (fmTitle) return fmTitle;
  const body = content.replace(FRONTMATTER_RE, "");
  const h1 = body.match(H1_RE);
  if (h1) return h1[1].trim();
  const filename = path.basename(relativePath, ".md");
  return filename
    .split(/[-_]/)
    .map((p) => (p.length ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function concatenateDocuments(docs) {
  return docs
    .map(({ absolutePath }) => {
      let content = readSourceFile(absolutePath);
      content = content.replace(FRONTMATTER_RE, "");
      content = content.replace(LIQUID_TAG_RE, "");
      content = content.replace(LIQUID_VAR_RE, "");
      return `${content.trim()}\n\n---`;
    })
    .join("\n\n");
}

// ----- Static prose blocks (copied verbatim from the Ruby plugin) -----

const VERSION_DETECTION_INSTRUCTIONS = `## IMPORTANT: Verify SDK and Metabase Version Compatibility

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

const MODULAR_EMBEDDING_GOTCHA_NOTES = `## Modular Embedding Deprecations and Gotchas

Watch out for these deprecated props and gotchas for Metabase 57 onwards, for modular embedding.

1. \`config\` prop on MetabaseProvider no longer exist as it is replaced by \`authConfig\`.
2. \`authProviderUri\` field no longer exist.
3. \`jwtProviderUri\` is an optional field that only exists in v58+. This is used to make JWT auth faster by skipping the \`GET /auth/sso\` discovery request. This field is not required for the initial implementation.
4. Numeric IDs must be integers not strings, e.g. \`dashboardId={1}\`. When the ID is retrieved from the router as a string AND it is numeric, \`parseInt\` it before passing it to the SDK.
5. IDs can also be strings for entity IDs, so you should NOT parse all IDs as numbers if entity IDs are also to be expected.
6. \`fetchRequestToken\` is not needed by default in most implementations. This is only used to customize how the SDK fetches the request token. For example, if the \`/sso/metabase\` endpoint in the user's backend requires passing custom auth tokens or headers.
7. When using \`fetchRequestToken\`, you MUST return the token in the shape of \`{jwt: "<jwt string>"}\`. Example: \`return {jwt: await response.json()}\`.`;

// ----- Builders -----

function buildIndexFile(docs) {
  const branch = versionToBranch(version);
  const rawBase = `https://raw.githubusercontent.com/${REPO}/refs/heads/${branch}`;

  const filtered = docs
    .filter(
      (d) => pathMatchesAllowlist(d.relativePath) && !pathMatchesExcludelist(d.relativePath),
    )
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const docLinks = filtered
    .map((d) => `- [${extractTitle(d.absolutePath, d.relativePath)}](${rawBase}/docs/${d.relativePath})`)
    .join("\n");

  const sectionLinks = LLMS_FULL_TO_GENERATE.filter((section) =>
    docs.some((d) => d.relativePath.includes(`${section}/`)),
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

${gotchaSection}
## Table of Contents

${docLinks}

## Complete References

These files are very large and are around 90,000 tokens. Do not use by default unless the context window is huge or RAG is supported in your editor.

${sectionLinks}
`;
}

function buildSectionFullFile(section, docs) {
  const sectionDocs = docs
    .filter((d) => d.relativePath.includes(`${section}/`))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (sectionDocs.length === 0) return null;

  const docsBaseUrl = `https://metabase.com/docs/${version}`;
  const gotchaSection =
    section === "embedding" && aboveVersion(version, 57)
      ? `${MODULAR_EMBEDDING_GOTCHA_NOTES}\n\n`
      : "";
  const body = concatenateDocuments(sectionDocs);
  const cap = section[0].toUpperCase() + section.slice(1);

  return `# Metabase ${cap} - Complete Reference for AI agents

> **This documentation is for Metabase ${formatVersionForDisplay(version)}.**
>
> Table of contents: ${docsBaseUrl}/${OUTPUT_FILE}

${VERSION_DETECTION_INSTRUCTIONS}

${gotchaSection}${body}
`;
}

// ----- Main -----

function main() {
  if (!fs.existsSync(docsSourceDir)) {
    console.error(`generate-llms-files: docs directory not found at ${docsSourceDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(distDir)) {
    console.error(`generate-llms-files: astro dist not found at ${distDir} — run the build first`);
    process.exit(1);
  }

  const docs = listMarkdownFiles(docsSourceDir);

  const indexContent = buildIndexFile(docs);
  fs.writeFileSync(path.join(distDir, OUTPUT_FILE), indexContent);
  console.log(`  wrote dist/${OUTPUT_FILE}`);

  for (const section of LLMS_FULL_TO_GENERATE) {
    const content = buildSectionFullFile(section, docs);
    if (!content) continue;
    const filename = `llms-${section}-full.txt`;
    fs.writeFileSync(path.join(distDir, filename), content);
    console.log(`  wrote dist/${filename}`);
  }
}

main();
