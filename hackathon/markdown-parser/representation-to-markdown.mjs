#!/usr/bin/env node
/**
 * Convert document representation JSON to Jekyll markdown (with frontmatter)
 *
 * Usage:
 *   node representation-to-markdown.mjs <representation-json-file>
 *   cat representation.json | node representation-to-markdown.mjs
 *   node representation-to-markdown.mjs --verbose < input.json
 *
 * Output: Jekyll markdown with frontmatter to stdout
 */

import { readFileSync } from "fs";
import { serializeProseMirror } from "./serialize-prosemirror.mjs";

// Convert document representation to Jekyll markdown
function representationToMarkdown(representationJson) {
  const doc = JSON.parse(representationJson);

  // Build frontmatter
  const frontmatter = {};

  // Add layout if present
  if (doc.layout) {
    frontmatter.layout = doc.layout;
  }

  // Add featured_image if present
  if (doc.featured_image) {
    frontmatter.featured_image = doc.featured_image;
  }

  // Add title (from name field)
  if (doc.name) {
    frontmatter.title = doc.name;
    frontmatter.name = doc.name;
  }

  // Add type
  if (doc.type) {
    frontmatter.type = doc.type;
  }

  // Add version
  if (doc.version) {
    frontmatter.version = doc.version;
  }

  // Add ref
  if (doc.ref) {
    frontmatter.ref = doc.ref;
  }

  // Add dashboard if present
  if (doc.dashboard) {
    frontmatter.dashboard = doc.dashboard;
  }

  // Add content_type
  if (doc.content_type) {
    frontmatter.content_type = doc.content_type;
  }

  // Serialize ProseMirror content to markdown
  const contentMarkdown = serializeProseMirror(JSON.stringify(doc.content));

  // Build Jekyll markdown with frontmatter
  const frontmatterLines = Object.entries(frontmatter).map(([key, value]) => {
    // Quote string values if they contain special characters or spaces
    if (typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes(' '))) {
      return `${key}: "${value}"`;
    }
    return `${key}: ${value}`;
  });

  const frontmatterBlock = ['---', ...frontmatterLines, '---', '', ''].join('\n');

  return frontmatterBlock + contentMarkdown;
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
  let jsonText;
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
      jsonText = await readStdin();
    } else {
      const filePath = args[0];
      if (verbose) {
        console.error(`Reading from file: ${filePath}`);
      }
      jsonText = readFileSync(filePath, "utf8");
    }

    const markdown = representationToMarkdown(jsonText);

    // Output markdown to stdout
    console.log(markdown);
  } catch (error) {
    console.error("Error converting representation to markdown:", error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
