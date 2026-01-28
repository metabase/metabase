import type { NodeViewProps } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";

import { CommentsMenu } from "metabase/documents/components/Editor/CommentsMenu";
import { useBlockMenus } from "metabase/documents/hooks/use-block-menus";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import S from "../extensions.module.css";

export const CustomBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addKeyboardShortcuts() {
    return {};
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockquoteNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(Blockquote.name)];
  },
});

export const BlockquoteNodeView = ({ node, editor, getPos }: NodeViewProps) => {
  const {
    _id,
    isOpen,
    isHovered,
    hovered,
    setHovered,
    threads,
    document,
    shouldShowMenus,
    setReferenceElement,
    commentsRefs,
    commentsFloatingStyles,
  } = useBlockMenus({ node, editor, getPos });

  return (
    <>
      <NodeViewWrapper
        aria-expanded={isOpen}
        className={cx(S.root, {
          [S.open]: isOpen || isHovered,
        })}
        data-node-id={_id}
        ref={setReferenceElement}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent<"blockquote"> as="blockquote" />
      </NodeViewWrapper>

      {shouldShowMenus && document && (
        <CommentsMenu
          active={isOpen}
          href={`/document/${document.id}/comments/${_id}`}
          ref={commentsRefs.setFloating}
          show={isOpen || hovered}
          style={commentsFloatingStyles}
          threads={threads}
        />
      )}
    </>
  );
};
