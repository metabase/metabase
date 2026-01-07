const fs = require("fs");
const path = require("path");

const REPO = "metabase/metabase";
const OUTPUT_FILE = "llms.txt";

// Sections to generate llms-<name>-full.txt for.
// Each section can define a preamble (introductory content before the main docs).
const LLMS_FULL_TO_GENERATE = [
  {
    section: "embedding",
    getPreamble: (branch) =>
      aboveVersion(branch, 57) ? getModularEmbeddingGotchaNotes() : "",
  },
];

/**
 * List directory recursively to get markdown files
 *
 * @param {string} docsPath - full path to docs directory
 * @returns {Array} list of markdown file objects with fullPath and relativePath
 */
function getMarkdownFilesList(docsPath) {
  if (!fs.existsSync(docsPath)) {
    console.error(`Error: Docs directory '${docsPath}' does not exist`);
    process.exit(1);
  }

  const entries = fs.readdirSync(docsPath, {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter((entry) => {
      return (
        entry.isFile() &&
        // Only markdown files
        entry.name.endsWith(".md") &&
        // Ignore README.md
        entry.name !== "README.md" &&
        // Ignore node_modules and hidden directories
        !entry.parentPath
          .split(path.sep)
          .some((dir) => dir === "node_modules" || dir.startsWith("."))
      );
    })
    .map((entry) => {
      const fullPath = path
        .join(entry.parentPath, entry.name)
        .replace(/\\/g, "/");

      const relativePath = path
        .relative(docsPath, fullPath)
        .replace(/\\/g, "/");

      return { fullPath, relativePath };
    });
}

/**
 * Generate llms.txt file with links to all markdown files in docs/
 *
 * @param {string} branch - branch name (e.g. 'master' or 'release-x.58.x')
 * @param {Array} files - list of all markdown file objects
 * @param {Array<Object>} sectionsConfig - list of section config objects to generate complete references for
 */
function generateLlmsTxt(branch, files, sectionsConfig) {
  const baseUrl = `https://raw.githubusercontent.com/${REPO}/refs/heads/${branch}`;

  const filesToExtract = files
    // Files in embedding/sdk/api/snippets does not exist in the repo.
    .filter(
      (file) => !file.relativePath.startsWith("embedding/sdk/api/snippets"),
    );

  const entries = filesToExtract.map((file) => {
    const content = fs.readFileSync(file.fullPath, "utf8");
    const title = extractTitle(content, file.relativePath);
    const url = `${baseUrl}/docs/${file.relativePath}`;

    return { title, url, path: file.relativePath };
  });

  // Generate table of contents entries
  const tableOfContents = entries.map(
    (entry) => `- [${entry.title}](${entry.url})`,
  );

  // Generate complete references entries
  const completeReferences = sectionsConfig
    .filter((config) =>
      files.some((file) => file.relativePath.startsWith(`${config.section}/`)),
    )
    .map((config) => {
      const capitalized =
        config.section.charAt(0).toUpperCase() + config.section.slice(1);
      return `- [${capitalized} - Complete Reference](${baseUrl}/llms-${config.section}-full.txt)`;
    });

  // Generate llms.txt content using template literal
  const content = `# Metabase Documentation
Metabase - The simplest, fastest way to get business intelligence and analytics to everyone in your company.

## Table of Contents

${tableOfContents.join("\n")}

## Complete References

These files are very large and are around 90,000 tokens. Do not use by default unless the context window is huge or RAG is supported in your editor.

${completeReferences.join("\n")}
`;

  fs.writeFileSync(OUTPUT_FILE, content, "utf8");

  console.log(
    `✅ Generated ${OUTPUT_FILE} with ${entries.length} markdown files`,
  );
  console.log(`   Branch: ${branch}`);
  console.log(`   Base URL: ${baseUrl}`);
}

/**
 * Generate llms-full.txt files for specified sections
 *
 * @param {string} branch - branch name (e.g., 'master', 'release-x.58.x')
 * @param {Array} files - list of all markdown file objects
 * @param {Array<Object>} sectionsConfig - list of section config objects to generate full files for
 */
function generateLlmsFullFiles(branch, files, sectionsConfig) {
  const baseUrl = `https://raw.githubusercontent.com/${REPO}/refs/heads/${branch}`;

  sectionsConfig.forEach((config) => {
    generateLlmsFullTxt(branch, config, files, baseUrl);
  });
}

/**
 * LLMs are likely to pay attention to the very first lines.
 *
 * We add the most important context for LLMs to avoid
 * confusion and pitfalls like out-of-date APIs in trained data.
 *
 * @returns {string} Markdown formatted gotcha notes
 */
function getModularEmbeddingGotchaNotes() {
  return `> **Important Version Notes**
>
> Watch out for these deprecated props and gotchas for Metabase 57 onwards, for modular embedding:
>
> 1. \`config\` prop on MetabaseProvider no longer exist - it is replaced by \`authConfig\`.
> 2. \`authProviderUri\` field no longer exist.
> 3. \`jwtProviderUri\` optional field only exists in v58+. This is used to make JWT auth faster by skipping the \`GET /auth/sso\` discovery request. Not needed for initial implementation.
> 4. \`fetchRequestToken\` is not needed by default. This is only used to customize how the SDK fetches the request token.
> 5. Numeric IDs must be integers not strings, e.g. \`dashboardId={1}\`. When the ID is retrieved from the URL and it is numeric, convert it to an integer via \`parseInt\` before passing it to the SDK. IDs can also be strings for entity ids, so you should not parse all IDs as numbers if entity ids are also to be expected.
`;
}

/**
 * Generate llms-full.txt file for a specific section
 * @param {string} branch - The branch name
 * @param {Object} config - Section config object with section name and optional getPreamble function
 * @param {Array} files - Array of all markdown file objects
 * @param {string} baseUrl - Base URL for raw GitHub links
 */
function generateLlmsFullTxt(branch, config, files, baseUrl) {
  const { section, getPreamble } = config;

  // Filter docs for this section
  const sectionFiles = files.filter((file) =>
    file.relativePath.startsWith(`${section}/`),
  );

  if (sectionFiles.length === 0) {
    console.log(`   Skipping llms-full.txt for ${section} (no files found)`);
    return;
  }

  // Build content
  const sectionCapitalized = section.charAt(0).toUpperCase() + section.slice(1);
  const header = `# Metabase ${sectionCapitalized} - Complete Reference for AI agents

> Table of contents: ${baseUrl}/${OUTPUT_FILE}

`;

  // Add preamble if provided (e.g., version-specific notes, warnings)
  const preamble = getPreamble ? getPreamble(branch) : "";

  // Concatenate all documents
  const docs = sectionFiles
    .map((file) => readAndCleanMarkdown(file.fullPath))
    .join("\n");

  // Write llms-full.txt file at repo root
  const content = header + preamble + "\n" + docs;
  const llmsFullPath = `llms-${section}-full.txt`;
  fs.writeFileSync(llmsFullPath, content, "utf8");

  console.log(
    `✅ Generated ${llmsFullPath} with ${sectionFiles.length} documents`,
  );
}

/**
 * Extract title from markdown file frontmatter or filename.
 *
 * We try to extract the title in this order: 1) YAML frontmatter
 * 2) first H1 heading, and 3) the Markdown file name.
 *
 * Example Markdown and frontmatter format:
 * ```markdown
 * ---
 * title: "Getting Started"
 * description: "A guide"
 * ---
 * # Getting Started
 * ```
 *
 * @param {string} content - file content
 * @param {string} filePath - relative file path
 * @returns {string} title of content
 */
function extractTitle(content, filePath) {
  // Try to extract title from YAML frontmatter
  // First, match against the YAML frontmatter delimiter `---`
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

  if (frontmatterMatch) {
    // Then, match against the title property
    // Example: `title: "My Page"`
    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);

    // Remove quotes if present
    if (titleMatch) {
      return titleMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  // Try to extract title from first H1 heading
  // Example: `# My Page`
  const h1Match = content.match(/^#\s+(.+)$/m);

  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback to filename, e.g. `my-page.md`
  const filename = path.basename(filePath, ".md");

  // Convert kebab-case or snake_case to Title Case
  // `my-page.md` would become "My Page"
  return filename
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Read and clean markdown file content
 *
 * @param {string} filePath - full path to the markdown file
 * @returns {string} cleaned markdown content with separator
 */
function readAndCleanMarkdown(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  // Strip YAML frontmatter
  content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

  // Strip Jekyll/Liquid template syntax
  content = content.replace(/\{%.*?%\}/g, "");
  content = content.replace(/\{\{.*?\}\}/g, "");

  return `${content.trim()}\n\n---\n`;
}

/**
 * Check if branch version is above target version
 * @param {string} branch - Branch name (e.g., 'master', 'release-x.58.x')
 * @param {number} targetVersion - Target version number
 * @returns {boolean}
 */
function aboveVersion(branch, targetVersion) {
  if (branch === "master") {
    return true;
  }

  // Parse version from release branch like "release-x.58.x" -> 58
  const match = branch.match(/release-x\.(\d+)\.x/);
  if (!match) {
    return false;
  }

  const version = parseInt(match[1], 10);

  return version >= targetVersion;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const docsPath = args[0] || "docs";
  const branch = args[1] || "master";

  const resolvedDocsPath = path.resolve(docsPath);
  const markdownFiles = getMarkdownFilesList(resolvedDocsPath);

  // Sort all files upfront for consistent ordering across all generated files
  markdownFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  generateLlmsTxt(branch, markdownFiles, LLMS_FULL_TO_GENERATE);
  generateLlmsFullFiles(branch, markdownFiles, LLMS_FULL_TO_GENERATE);
}
