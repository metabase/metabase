import type { JSONContent } from "@tiptap/core";

import type { DocumentContent } from "metabase-types/api";

function isEmptyParagraphNode(node: JSONContent) {
  if (node.type !== "paragraph") {
    return false;
  }
  // Empty paragraph => no content or content has no text nodes with non-empty text
  if (!node.content || node.content.length === 0) {
    return true;
  }
  const hasNonEmptyText = node.content.some(
    (child) =>
      child.type === "text" &&
      typeof child.text === "string" &&
      child.text.trim().length > 0,
  );
  return !hasNonEmptyText;
}

export function trimTrailingEmptyParagraphsJSON(
  doc: DocumentContent,
): DocumentContent {
  if (!doc?.content || !Array.isArray(doc.content)) {
    return doc;
  }

  let dropping = true; // drop until we hit a non-empty node
  const trimmed = doc.content
    .reduceRight<DocumentContent[]>((acc, node) => {
      if (dropping && isEmptyParagraphNode(node)) {
        return acc; // skip this trailing empty paragraph
      }
      dropping = false;
      acc.push(node);
      return acc;
    }, [])
    .reverse();

  return { ...doc, content: trimmed };
}
