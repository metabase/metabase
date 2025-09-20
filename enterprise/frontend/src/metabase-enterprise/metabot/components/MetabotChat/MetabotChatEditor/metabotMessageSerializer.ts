import type { JSONContent } from "@tiptap/core";

/**
 * Serializes TipTap JSON content to a string format with metabase:// links
 *
 * Converts SmartLink nodes to [entity name](metabase://model/id) format
 * Example:
 *   SmartLink { entityId: 123, model: "table", label: "Orders" }
 *   → "[Orders](metabase://table/123)"
 */
export function serializeToMetabotFormat(content: JSONContent): string {
  if (!content || !content.content) {
    return "";
  }

  return serializeNodes(content.content);
}

function serializeNodes(nodes: JSONContent[]): string {
  return nodes.map((node) => serializeNode(node)).join("");
}

function serializeNode(node: JSONContent): string {
  switch (node.type) {
    case "paragraph":
      return serializeParagraph(node);

    case "text":
      return node.text || "";

    case "smartLink":
    case "metabotSmartLink":
      return serializeSmartLink(node);

    case "hardBreak":
      return "\n";

    default:
      // Fallback for any other node types
      if (node.content) {
        return serializeNodes(node.content);
      }
      return node.text || "";
  }
}

function serializeParagraph(node: JSONContent): string {
  // Add newline after paragraph if there's content
  // But we'll handle paragraph separation in the parent context
  return !node.content || node.content.length === 0
    ? ""
    : serializeNodes(node.content);
}

function serializeSmartLink(node: JSONContent): string {
  const { entityId, model, label } = node.attrs || {};

  if (!entityId || !model) {
    console.warn("SmartLink missing required attributes", node);
    return label || "[unknown]";
  }

  // Map internal types back to URL types for serialization
  let urlModel = model;
  if (model === "dataset") {
    urlModel = "model";
  } else if (model === "card") {
    urlModel = "question";
  }

  // Format: [entity name](metabase://model/id)
  const displayName = label || `${model} ${entityId}`;
  return `[${displayName}](metabase://${urlModel}/${entityId})`;
}

/**
 * Parses a metabase:// formatted string back to TipTap JSON content
 * This is useful for editing existing messages or displaying chat history
 */
export function parseMetabotFormat(text: string): JSONContent {
  const doc: JSONContent = {
    type: "doc",
    content: [],
  };

  if (!text) {
    return doc;
  }

  // Split text by lines to handle paragraphs
  const lines = text.split("\n");

  lines.forEach((line, lineIndex) => {
    const paragraph: JSONContent = {
      type: "paragraph",
      content: [],
    };

    // Regex to match [name](metabase://model/id) pattern
    const mentionRegex = /\[([^\]]+)\]\(metabase:\/\/([^\/]+)\/(\d+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(line)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        paragraph.content!.push({
          type: "text",
          text: line.slice(lastIndex, match.index),
        });
      }

      // Add MetabotSmartLink node
      // Map URL types back to internal types for SmartLink component
      let internalModel = match[2];
      if (match[2] === "model") {
        internalModel = "dataset";
      } else if (match[2] === "question") {
        internalModel = "card";
      }

      paragraph.content!.push({
        type: "metabotSmartLink",
        attrs: {
          label: match[1],
          model: internalModel,
          entityId: parseInt(match[3], 10),
        },
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last mention
    if (lastIndex < line.length) {
      paragraph.content!.push({
        type: "text",
        text: line.slice(lastIndex),
      });
    }

    // Only add non-empty paragraphs
    if (paragraph.content!.length > 0) {
      doc.content!.push(paragraph);
    } else if (lineIndex < lines.length - 1) {
      // Add empty paragraph for blank lines (except last)
      doc.content!.push({
        type: "paragraph",
        content: [],
      });
    }
  });

  // Ensure at least one paragraph exists
  if (doc.content!.length === 0) {
    doc.content!.push({
      type: "paragraph",
      content: [],
    });
  }

  return doc;
}
