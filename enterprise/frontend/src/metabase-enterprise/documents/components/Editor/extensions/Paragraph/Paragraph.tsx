import { Node, type NodeViewProps, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { uuid } from "metabase/lib/uuid";
import { Box, Button, Icon, rem } from "metabase/ui";
import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import { useDocumentContext } from "metabase-enterprise/documents/components/DocumentContext";

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
  const { childTargetId, comments, document, hasUnsavedChanges } =
    useDocumentContext();

  const isOpen = childTargetId === _id;
  const nodeThreads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );
  const hasComments = nodeThreads.length > 0;

  return (
    <NodeViewWrapper
      className={cx(S.paragraph, {
        [S.open]: isOpen,
      })}
      as="p"
    >
      <NodeViewContent />

      {document && (
        <Box
          className={cx(S.commentsMenu, {
            [S.visible]: hasComments || isOpen,
          })}
          mt={rem(-2)}
          pr="lg"
        >
          <Link
            to={
              hasUnsavedChanges
                ? undefined
                : `/document/${document.id}/comments/${_id}`
            }
          >
            <Button
              leftSection={<Icon name="message" />}
              px="sm"
              size="xs"
              variant={isOpen ? "filled" : "default"}
            >
              {hasComments ? t`Comments (${comments?.length})` : t`Add comment`}
            </Button>
          </Link>
        </Box>
      )}
    </NodeViewWrapper>
  );
};
