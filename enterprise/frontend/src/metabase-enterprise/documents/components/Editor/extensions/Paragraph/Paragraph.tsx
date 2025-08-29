import { autoUpdate, useFloating } from "@floating-ui/react";
// our Portal in metabase/ui does not work here, so we're using the originnal Mantine one
import { Portal } from "@mantine/core";
import { Node, type NodeViewProps, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useMemo, useState } from "react";
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

  const { refs, floatingStyles } = useFloating({
    placement: "left-start",
    whileElementsMounted: autoUpdate,
    strategy: "fixed",
  });

  const [hovered, setHovered] = useState(false);

  return (
    <>
      <NodeViewWrapper
        className={cx(S.paragraph, {
          [S.open]: isOpen,
        })}
        ref={refs.setReference}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <NodeViewContent as="p" />
      </NodeViewWrapper>

      {document && (
        <Portal>
          <Box
            className={cx(S.commentsMenu, {
              [S.visible]: hasComments || isOpen || hovered,
            })}
            mt={rem(-2)}
            pr="lg"
            ref={refs.setFloating}
            style={floatingStyles}
          >
            <Button
              disabled={hasUnsavedChanges}
              leftSection={<Icon name="message" />}
              px="sm"
              size="xs"
              variant={isOpen ? "filled" : "default"}
              {...(hasUnsavedChanges || isOpen
                ? undefined
                : {
                    component: Link,
                    to: `/document/${document.id}/comments/${_id}`,
                  })}
            >
              {hasComments
                ? t`Comments (${nodeThreads.flat().length})`
                : t`Add comment`}
            </Button>
          </Box>
        </Portal>
      )}
    </>
  );
};
