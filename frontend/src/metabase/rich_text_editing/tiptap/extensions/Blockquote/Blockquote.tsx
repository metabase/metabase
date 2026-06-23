import type { NodeViewProps } from "@tiptap/core";
import {
  Blockquote,
  type BlockquoteOptions,
} from "@tiptap/extension-blockquote";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomBlockquote = Blockquote.extend<
  BlockquoteOptions & BlockNodeOptions
>({
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
    return [createProseMirrorPlugin("blockquote")];
  },
});

export const BlockquoteNodeView = ({
  node,
  editor,
  getPos,
  extension,
}: NodeViewProps) => {
  const BlockShell = extension.options.blockShell ?? DefaultBlockShell;

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
          childTargetId={_id}
          ref={commentsRefs.setFloating}
          show={isOpen || hovered}
          style={commentsFloatingStyles}
          unresolvedCommentsCount={unresolvedCommentsCount}
        />
      )}
    </>
  );
};
