import { ReactNodeViewRenderer } from "@tiptap/react";

import { SmartLinkComponent, SmartLinkNode } from "./SmartLinkNode";

export * from "./SmartLinkNode";

export const SmartLinkEmbed = SmartLinkNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SmartLinkComponent);
  },
});
