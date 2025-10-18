#!/usr/bin/env node
/**
 * Convert Jekyll markdown (with frontmatter) to complete document representation JSON
 *
 * Usage:
 *   node markdown-to-representation.mjs <markdown-file>
 *   cat file.md | node markdown-to-representation.mjs
 *   node markdown-to-representation.mjs --verbose < input.md
 *
 * Output: Complete document representation JSON to stdout
 */

import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { parseMarkdown } from "./parse-markdown.mjs";

// Extract frontmatter from markdown
function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, content: markdown };
  }

  // Simple YAML parsing (just key: value pairs)
  const frontmatterText = match[1];
  const frontmatter = {};
  const lines = frontmatterText.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();
      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[key] = value;
    }
  }

  return {
    frontmatter,
    content: match[2],
  };
}

// Generate a unique entity ID (base64url encoded random bytes)
function generateEntityId() {
  return randomBytes(15)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// Generate complete document representation
function markdownToDocument(markdownText) {
  const { frontmatter, content } = extractFrontmatter(markdownText);

  // Parse markdown content to ProseMirror JSON using existing parser
  const contentJson = parseMarkdown(content);

  // Build complete representation with all frontmatter fields preserved
  const representation = {
    name: frontmatter.title || frontmatter.name || "Untitled Document",
    type: frontmatter.type || "document",
    version: frontmatter.version || "v0",
    ref: frontmatter.ref || "document",
    content: contentJson,
    content_type: frontmatter.content_type || "application/json+vnd.prose-mirror",
  };

  // Preserve optional fields if present
  if (frontmatter.layout) {
    representation.layout = frontmatter.layout;
  }
  if (frontmatter.featured_image) {
    representation.featured_image = frontmatter.featured_image;
  }
  if (frontmatter.dashboard) {
    representation.dashboard = parseInt(frontmatter.dashboard);
  }

  return representation;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  let markdownText;
  let verbose = false;

  const verboseIndex = args.indexOf("--verbose");
  if (verboseIndex !== -1) {
    verbose = true;
    args.splice(verboseIndex, 1);
  }

  try {
    if (args.length === 0 || args[0] === "-") {
      if (verbose) {
        console.error("Reading from stdin...");
      }
      markdownText = await readStdin();
    } else {
      const filePath = args[0];
      if (verbose) {
        console.error(`Reading from file: ${filePath}`);
      }
      markdownText = readFileSync(filePath, "utf8");
    }

    const documentJson = markdownToDocument(markdownText);

    // Output JSON to stdout
    console.log(JSON.stringify(documentJson, null, 2));
  } catch (error) {
    console.error("Error generating document:", error.message);
    process.exit(1);
  }
}

main();
