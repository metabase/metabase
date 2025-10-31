#!/usr/bin/env node
/**
 * ProseMirror to Markdown serializer - Standalone version
 * This script converts ProseMirror JSON to Markdown without external dependencies
 */

import { readFileSync } from "fs";

// Simple markdown serializer that handles ProseMirror JSON structure
function serializeProseMirrorToMarkdown(doc) {
  if (!doc || doc.type !== "doc") {
    throw new Error("Invalid ProseMirror document structure");
  }

  const lines = [];

  function serializeNode(node) {
    const type = node.type;

    switch (type) {
      case "paragraph":
        lines.push(serializeInlineContent(node.content || []));
        lines.push("");
        break;

      case "heading":
        const level = node.attrs?.level || 1;
        const prefix = "#".repeat(level);
        lines.push(`${prefix} ${serializeInlineContent(node.content || [])}`);
        lines.push("");
        break;

      case "codeBlock":
        lines.push("```");
        if (node.content) {
          node.content.forEach((child) => {
            if (child.type === "text") {
              lines.push(child.text || "");
            }
          });
        }
        lines.push("```");
        lines.push("");
        break;

      case "blockquote":
        if (node.content) {
          const quotedLines = [];
          node.content.forEach((child) => {
            const saved = lines.length;
            serializeNode(child);
            // Take the lines that were just added
            while (lines.length > saved) {
              quotedLines.push(lines.pop());
            }
          });
          quotedLines.reverse().forEach((line) => {
            lines.push(line ? `> ${line}` : ">");
          });
        }
        lines.push("");
        break;

      case "bulletList":
        if (node.content) {
          node.content.forEach((item) => serializeListItem(item, "-"));
        }
        lines.push("");
        break;

      case "orderedList":
        const start = node.attrs?.order || 1;
        if (node.content) {
          node.content.forEach((item, index) => {
            serializeListItem(item, `${start + index}.`);
          });
        }
        lines.push("");
        break;

      case "horizontalRule":
        lines.push("---");
        lines.push("");
        break;

      case "hardBreak":
        lines.push("  ");
        break;

      case "cardEmbed":
        const { id, name } = node.attrs || {};
        if (name) {
          lines.push(`{% card id=${id} name="${name}" %}`);
        } else {
          lines.push(`{% card id=${id} %}`);
        }
        lines.push("");
        break;

      case "resizeNode":
        // Check if it contains a flexContainer
        const child = node.content?.[0];
        if (child && child.type === "flexContainer") {
          serializeFlexContainer(child);
        } else if (child) {
          serializeNode(child);
        }
        break;

      case "flexContainer":
        serializeFlexContainer(node);
        break;

      default:
        // For unknown nodes, try to serialize their content
        if (node.content) {
          node.content.forEach((child) => serializeNode(child));
        }
    }
  }

  function serializeFlexContainer(node) {
    const { columnWidths } = node.attrs || { columnWidths: [50, 50] };
    const hasCustomWidths =
      columnWidths && (columnWidths[0] !== 50 || columnWidths[1] !== 50);

    if (hasCustomWidths) {
      const [w1, w2] = columnWidths;
      lines.push(`{% row widths="${w1.toFixed(2)}:${w2.toFixed(2)}" %}`);
    } else {
      lines.push(`{% row %}`);
    }

    // Serialize the cards inside
    if (node.content) {
      node.content.forEach((card) => {
        const { id, name } = card.attrs || {};
        if (name) {
          lines.push(`{% card id=${id} name="${name}" %}`);
        } else {
          lines.push(`{% card id=${id} %}`);
        }
      });
    }

    lines.push(`{% endrow %}`);
    lines.push("");
  }

  function serializeListItem(item, bullet) {
    if (!item.content) return;

    // Get the first paragraph's content
    const firstPara = item.content[0];
    if (firstPara && firstPara.type === "paragraph") {
      lines.push(`${bullet} ${serializeInlineContent(firstPara.content || [])}`);
    }

    // Handle nested blocks
    for (let i = 1; i < item.content.length; i++) {
      const child = item.content[i];
      const saved = lines.length;
      serializeNode(child);
      // Indent nested content
      while (lines.length > saved) {
        const line = lines.pop();
        lines.push(line ? `  ${line}` : "");
      }
      lines.reverse();
      for (let j = saved; j < lines.length; j++) {
        const temp = lines[j];
        lines[j] = lines[lines.length - 1 - (j - saved)];
        lines[lines.length - 1 - (j - saved)] = temp;
      }
    }
  }

  function serializeInlineContent(content) {
    return content
      .map((node) => {
        if (node.type === "text") {
          return applyMarks(node.text || "", node.marks || []);
        } else if (node.type === "hardBreak") {
          return "  \n";
        }
        return "";
      })
      .join("");
  }

  function applyMarks(text, marks) {
    let result = text;

    // Apply marks in reverse order for proper nesting
    for (let i = marks.length - 1; i >= 0; i--) {
      const mark = marks[i];
      switch (mark.type) {
        case "bold":
        case "strong":
          result = `**${result}**`;
          break;
        case "italic":
        case "em":
          result = `*${result}*`;
          break;
        case "code":
          result = `\`${result}\``;
          break;
        case "link":
          const href = mark.attrs?.href || "";
          const title = mark.attrs?.title;
          if (title) {
            result = `[${result}](${href} "${title}")`;
          } else {
            result = `[${result}](${href})`;
          }
          break;
      }
    }

    return result;
  }

  // Serialize all top-level nodes
  if (doc.content) {
    doc.content.forEach((node) => serializeNode(node));
  }

  // Remove trailing empty lines and join
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines.join("\n");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function serializeProseMirror(jsonText) {
  const pmJson = JSON.parse(jsonText);
  return serializeProseMirrorToMarkdown(pmJson);
}

async function main() {
  const args = process.argv.slice(2);
  let jsonText;
  let verbose = false;

  // Check for --verbose flag
  const verboseIndex = args.indexOf("--verbose");
  if (verboseIndex !== -1) {
    verbose = true;
    args.splice(verboseIndex, 1);
  }

  try {
    // Read from stdin if no file provided or if '-' is specified
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

    const markdown = serializeProseMirror(jsonText);

    // Output markdown to stdout
    console.log(markdown);
  } catch (error) {
    console.error("Error serializing ProseMirror:", error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Only run main if this file is being executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
