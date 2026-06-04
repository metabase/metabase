import type { JSONContent } from "@tiptap/core";

import { documentToMarkdown } from "metabase/metabot/utils/document-markdown";

/** The document rendered as Markdown text (used for copy / download). */
export function documentText(doc: JSONContent): string {
  return documentToMarkdown(doc).markdown;
}

export async function copyDocument(doc: JSONContent): Promise<void> {
  await navigator.clipboard.writeText(documentText(doc));
}

export function downloadDocument(doc: JSONContent, name: string): void {
  const blob = new Blob([documentText(doc)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${name || "document"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
