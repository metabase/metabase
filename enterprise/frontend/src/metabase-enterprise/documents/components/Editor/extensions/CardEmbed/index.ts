import { ReactNodeViewRenderer } from "@tiptap/react";

import { CardEmbedComponent, CardEmbedNode } from "./CardEmbedNode";

export * from "./CardEmbedNode";

export const CardEmbed = CardEmbedNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CardEmbedComponent);
  },
});
