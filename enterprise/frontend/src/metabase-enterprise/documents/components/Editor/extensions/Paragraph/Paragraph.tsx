import { autoUpdate, useFloating } from "@floating-ui/react";
import { Node, type NodeViewProps, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { getTargetChildCommentThreads } from "metabase-enterprise/comments/utils";
import { useDocumentContext } from "metabase-enterprise/documents/components/DocumentContext";
import { isTopLevel } from "metabase-enterprise/documents/utils/editorNodeUtils";

import { CommentsMenu } from "../../CommentsMenu";
import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";

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
      satParagraph: () => ReturnType;
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
          return commands.setNode(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": () => this.editor.commands.setParagraph(),
    };
  },
});

export const ParagraphNodeView = ({ node, editor, getPos }: NodeViewProps) => {
  const { childTargetId, comments, document, hasUnsavedChanges } =
    useDocumentContext();
  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const { _id } = node.attrs;
  const isOpen = childTargetId === _id;
  const threads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );
  const { refs, floatingStyles } = useFloating({
    placement: "left-start",
    whileElementsMounted: autoUpdate,
    strategy: "fixed",
    open: rendered,
  });

  useEffect(() => {
    if (!rendered) {
      setRendered(true);
    }
  }, [rendered]);

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

      {document && rendered && isTopLevel({ editor, getPos }) && (
        <CommentsMenu
          active={isOpen}
          disabled={hasUnsavedChanges}
          href={`/document/${document.id}/comments/${_id}`}
          ref={refs.setFloating}
          show={isOpen || hovered}
          threads={threads}
          style={floatingStyles}
        />
      )}
    </>
  );
};
