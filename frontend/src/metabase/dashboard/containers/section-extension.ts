import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import SectionComponent from "./SectionComponent";

export default Node.create({
  name: "sectionComponent",

  group: "block",

  content: "inline*",

  parseHTML() {
    return [
      {
        tag: "section-component",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section-component", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionComponent);
  },
});
