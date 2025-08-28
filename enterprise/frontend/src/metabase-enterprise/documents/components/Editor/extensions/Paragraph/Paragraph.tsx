import { Node, type NodeViewProps, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { t } from "ttag";

import { uuid } from "metabase/lib/uuid";
import { Box, Button, Icon } from "metabase/ui";

import {
  ID_ATTRIBUTE_NAME,
  createIdAttribute,
  createProseMirrorPlugin,
} from "../NodeIds";

import S from "./Paragraph.module.css";

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
      ...createIdAttribute(),
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

  addNodeView() {
    return ReactNodeViewRenderer(ParagraphNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("paragraph")];
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

export const ParagraphNodeView = ({ node }: NodeViewProps) => {
  const { _id } = node.attrs;
  // const { entity, isLoading, error } = useEntityData(entityId, model);
  const comments = [];

  return (
    <NodeViewWrapper as="p" className={S.paragraph}>
      <NodeViewContent />

      <Box className={S.commentsMenu} pl="xl">
        <Button leftSection={<Icon name="message" />} px="sm" size="xs">
          {comments.length === 0
            ? t`Add comment`
            : comments.length === 1
              ? t`See 1 comment`
              : t`See ${comments.length} comments`}
        </Button>
      </Box>
    </NodeViewWrapper>
  );
};
