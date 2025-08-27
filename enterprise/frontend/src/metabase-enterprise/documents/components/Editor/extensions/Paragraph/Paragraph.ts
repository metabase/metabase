import { Node, mergeAttributes } from "@tiptap/core";

import { uuid } from "metabase/lib/uuid";

import { ID_ATTRIBUTE_NAME } from "../NodeIds";

export interface ParagraphOptions {
  /**
   * The HTML attributes for a paragraph node.
   * @default {}
   * @example { class: 'foo' }
   */
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraph: {
      /**
       * Toggle a paragraph
       * @example editor.commands.toggleParagraph()
       */
      setParagraph: () => ReturnType;
    };
  }
}

/**
 * This extension allows you to create paragraphs.
 * @see https://www.tiptap.dev/api/nodes/paragraph
 */
export const Paragraph = Node.create<ParagraphOptions>({
  name: "paragraph",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: "block",

  content: "inline*",

  addAttributes() {
    return {
      [ID_ATTRIBUTE_NAME]: {
        default: null,
        parseHTML: (el) => el.getAttribute(ID_ATTRIBUTE_NAME) || null,
        renderHTML: (attrs) =>
          attrs[ID_ATTRIBUTE_NAME]
            ? { [ID_ATTRIBUTE_NAME]: attrs[ID_ATTRIBUTE_NAME] }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setParagraph:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name, { [ID_ATTRIBUTE_NAME]: uuid() });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": () => this.editor.commands.setParagraph(),
    };
  },
});
