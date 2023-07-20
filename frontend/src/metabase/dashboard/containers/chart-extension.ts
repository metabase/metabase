import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import Component from "./ChartComponent";

export default Node.create({
  name: "mbChart",
  group: "block",
  // content: "block+",
  atom: true,
  draggable: true,

  parseHTML() {
    return [
      {
        tag: 'mb-chart[data-type="draggable-item"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "mb-chart",
      mergeAttributes(HTMLAttributes, { "data-type": "draggable-item" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(Component);
  },
});
