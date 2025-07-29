import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { MetabotCodeBlockComponent } from "./MetabotCodeBlockComponent";

export const MetabotCodeBlock = Node.create({
  name: "metabotCodeBlock",
  group: "block",
  content: "text*",
  code: true,

  addAttributes() {
    return {
      language: {
        default: "metabot",
        parseHTML: element => element.getAttribute("data-language"),
        renderHTML: attributes => {
          return {
            "data-language": attributes.language,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "pre",
        getAttrs: element => {
          const codeElement = element.querySelector("code");
          if (codeElement?.classList.contains("language-metabot")) {
            return { language: "metabot" };
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["pre", mergeAttributes(HTMLAttributes), ["code", {}, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MetabotCodeBlockComponent);
  },
});
