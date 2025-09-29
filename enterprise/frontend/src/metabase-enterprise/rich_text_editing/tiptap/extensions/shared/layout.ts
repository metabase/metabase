import type { JSONContent } from "@tiptap/core";

export const wrapCardEmbed = (cardEmbedNode: JSONContent): JSONContent => ({
  type: "resizeNode",
  content: [cardEmbedNode],
});
