const fs = require("fs");
const path = require("path");

// Sections to generate llms-full.txt for
const LLMS_FULL_TO_GENERATE = ["embedding"];

/**
 * Scan directory for markdown files
 * @param {string} docsPath - Full path to docs directory
 * @returns {Array} Array of markdown file objects with fullPath and relativePath
 */
function scanMarkdownFiles(docsPath) {
  const markdownFiles = [];

  if (!fs.existsSync(docsPath)) {
    console.error(`Error: Docs directory '${docsPath}' does not exist`);
    process.exit(1);
  }

  function scanDirectory(dir, baseDir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        // Skip node_modules and other common directories
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }

        scanDirectory(fullPath, baseDir);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        if (entry.name === "README.md" || !entry.name.endsWith(".md")) {
          continue;
        }

        markdownFiles.push({
          fullPath,
          // Normalize path separators
          relativePath: relativePath.replace(/\\/g, "/"),
        });
      }
    }
  }

  scanDirectory(docsPath, docsPath);
  return markdownFiles;
}

/**
 * Generate llms.txt file with links to all markdown files in docs/
 *
 * @param {string} branch - The branch name (e.g., 'master', 'release-x.58.x')
 * @param {string} docsDir - Path to docs directory (default: 'docs')
 * @param {string} outputPath - Path where llms.txt should be written (default: 'llms.txt')
 * @param {Array} markdownFiles - Array of all markdown file objects
 */
function generateLlmsTxt(
  branch,
  docsDir = "docs",
  outputPath = "llms.txt",
  markdownFiles,
) {
  const repoOwner = "metabase";
  const repoName = "metabase";
  const baseUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/refs/heads/${branch}`;

  // Filter out files in embedding/sdk/api/snippets (these don't exist in repo),
  // and sort them alphabetically.
  const filesToExtract = markdownFiles
    .filter(
      (file) => !file.relativePath.startsWith("embedding/sdk/api/snippets"),
    )
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const entries = filesToExtract.map((file) => {
    const content = fs.readFileSync(file.fullPath, "utf8");
    const title = extractTitle(content, file.relativePath);
    const url = `${baseUrl}/${docsDir}/${file.relativePath}`;

    return { title, url, path: file.relativePath };
  });

  // Generate table of contents entries
  const tableOfContents = entries.map(
    (entry) => `- [${entry.title}](${entry.url})`,
  );

  // Generate complete references entries
  const completeReferences = LLMS_FULL_TO_GENERATE.filter((section) =>
    markdownFiles.some((file) => file.relativePath.startsWith(`${section}/`)),
  ).map((section) => {
    const capitalized = section.charAt(0).toUpperCase() + section.slice(1);
    return `- [${capitalized} - Complete Reference](${baseUrl}/llms-${section}-full.txt)`;
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

  fs.writeFileSync(outputPath, content, "utf8");

  console.log(
    `✅ Generated ${outputPath} with ${entries.length} markdown files`,
  );
  console.log(`   Branch: ${branch}`);
  console.log(`   Base URL: ${baseUrl}`);
}

/**
 * Generate llms-full.txt files for specified sections
 *
 * @param {string} branch - The branch name (e.g., 'master', 'release-x.58.x')
 * @param {string} docsDir - Path to docs directory (default: 'docs')
 * @param {string} outputPath - Path where llms.txt was written (used to determine output directory)
 * @param {Array} markdownFiles - Array of all markdown file objects
 * @param {string} docsPath - Full path to docs directory
 */
function generateLlmsFullFiles(
  branch,
  docsDir = "docs",
  outputPath = "llms.txt",
  markdownFiles,
  docsPath,
) {
  const repoOwner = "metabase";
  const repoName = "metabase";
  const baseUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/refs/heads/${branch}`;

  LLMS_FULL_TO_GENERATE.forEach((section) => {
    generateLlmsFullTxt(
      branch,
      docsDir,
      section,
      markdownFiles,
      docsPath,
      baseUrl,
      outputPath,
    );
  });
}

/**
 * Check if branch version is above target version
 * @param {string} branch - Branch name (e.g., 'master', 'release-x.58.x')
 * @param {number} targetVersion - Target version number
 * @returns {boolean}
 */
function aboveVersion(branch, targetVersion) {
  // master always gets the notes
  if (branch === "master") {
    return true;
  }

  // Parse version from release branch like "release-x.58.x" -> 58
  const match = branch.match(/release-x\.(\d+)\.x/);
  if (!match) {
    return false;
  }

  const versionNum = parseInt(match[1], 10);
  return versionNum >= targetVersion;
}

/**
 * LLMs are likely to pay attention to the very first lines of llms.txt
 *
 * We add the most important context for LLMs to avoid
 * confusion and pitfalls like out-of-date APIs in trained data.
 *
 * @param {Array<string>} lines - Array of lines to append to
 */
function addModularEmbeddingGotchaNotes(lines) {
  lines.push("> **Important Version Notes+**");
  lines.push(">");
  lines.push(
    "> Watch out for these deprecated props and gotchas for Metabase 57 onwards, for modular embedding:",
  );
  lines.push(">");
  lines.push(
    "> 1. `config` prop on MetabaseProvider no longer exist - it is replaced by `authConfig`.",
  );
  lines.push("> 2. `authProviderUri` field no longer exist.");
  lines.push(
    "> 3. `jwtProviderUri` optional field only exists in v58+. This is used to make JWT auth faster by skipping the `GET /auth/sso` discovery request. Not needed for initial implementation.",
  );
  lines.push(
    "> 4. `fetchRequestToken` is not needed by default. This is only used to customize how the SDK fetches the request token.",
  );
  lines.push(
    "> 5. Numeric IDs must be integers not strings, e.g. `dashboardId={1}`. When the ID is retrieved from the URL and it is numeric, convert it to an integer via `parseInt` before passing it to the SDK. IDs can also be strings for entity ids, so you should not parse all IDs as numbers if entity ids are also to be expected.",
  );
  lines.push("");
}

/**
 * Concatenate a single document into the lines array
 * @param {Array<string>} lines - Array of lines to append to
 * @param {string} filePath - Full path to the markdown file
 */
function concatenateDocument(lines, filePath) {
  // Read the source file
  let content = fs.readFileSync(filePath, "utf8");

  // Strip YAML frontmatter
  content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");

  // Strip Jekyll/Liquid template syntax
  content = content.replace(/\{%.*?%\}/g, "");
  content = content.replace(/\{\{.*?\}\}/g, "");

  // Add document content
  lines.push(content.trim());
  lines.push("");
  lines.push("---");
  lines.push("");
}

/**
 * Generate llms-full.txt file for a specific section
 * @param {string} branch - The branch name
 * @param {string} docsDir - Path to docs directory
 * @param {string} section - Section name (e.g., 'embedding')
 * @param {Array} markdownFiles - Array of all markdown file objects
 * @param {string} docsPath - Full path to docs directory
 * @param {string} baseUrl - Base URL for raw GitHub links
 * @param {string} llmsTxtPath - Path to the llms.txt file (for reference and output directory)
 */
function generateLlmsFullTxt(
  branch,
  docsDir,
  section,
  markdownFiles,
  docsPath,
  baseUrl,
  llmsTxtPath,
) {
  // Filter docs for this section
  const sectionFiles = markdownFiles.filter((file) =>
    file.relativePath.startsWith(`${section}/`),
  );

  if (sectionFiles.length === 0) {
    console.log(`   Skipping llms-full.txt for ${section} (no files found)`);
    return;
  }

  // Sort by path for consistent ordering
  sectionFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Concatenate content
  const lines = [];
  const sectionCapitalized = section.charAt(0).toUpperCase() + section.slice(1);
  lines.push(`# Metabase ${sectionCapitalized} - Complete Reference`);
  lines.push("");
  // Reference the llms.txt file at repo root
  const llmsTxtUrl = `${baseUrl}/${path.basename(llmsTxtPath)}`;
  lines.push(`> Table of contents: ${llmsTxtUrl}`);
  lines.push("");

  // Add special note for embedding section
  // applicable to v57+
  if (section === "embedding" && aboveVersion(branch, 57)) {
    addModularEmbeddingGotchaNotes(lines);
  }

  // Concatenate all documents
  sectionFiles.forEach((file) => {
    concatenateDocument(lines, file.fullPath);
  });

  // Write llms-full.txt file at repo root (same directory as llms.txt)
  const outputDir = path.dirname(llmsTxtPath);
  const llmsFullPath = path.join(outputDir, `llms-${section}-full.txt`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(llmsFullPath, lines.join("\n") + "\n", "utf8");
  console.log(
    `✅ Generated ${path.relative(process.cwd(), llmsFullPath)} with ${sectionFiles.length} documents`,
  );
}

/**
 * Extract title from markdown file frontmatter or filename
 * @param {string} content - File content
 * @param {string} filePath - Relative file path
 * @returns {string} Title
 */
function extractTitle(content, filePath) {
  // Try to extract title from YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
    if (titleMatch) {
      // Remove quotes if present
      return titleMatch[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  // Try to extract title from first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback to filename
  const filename = path.basename(filePath, ".md");
  // Convert kebab-case or snake_case to Title Case
  return filename
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Main execution
if (require.main === module) {
  const branch =
    process.env.GITHUB_REF?.replace(/^refs\/heads\//, "") ||
    process.env.BRANCH ||
    "master";

  const args = process.argv.slice(2);
  const docsDir = args[0] || "docs";
  const outputPath = args[1] || "llms.txt";
  const branchArg = args[2] || branch;

  const docsPath = path.resolve(docsDir);
  const markdownFiles = scanMarkdownFiles(docsPath);

  generateLlmsTxt(branchArg, docsDir, outputPath, markdownFiles);
  generateLlmsFullFiles(
    branchArg,
    docsDir,
    outputPath,
    markdownFiles,
    docsPath,
  );
}

module.exports = {
  generateLlmsTxt,
  generateLlmsFullFiles,
  scanMarkdownFiles,
  extractTitle,
  generateLlmsFullTxt,
  LLMS_FULL_TO_GENERATE,
};
