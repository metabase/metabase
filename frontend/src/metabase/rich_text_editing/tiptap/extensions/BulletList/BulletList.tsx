import type { NodeViewProps } from "@tiptap/core";
import {
  BulletList,
  type BulletListOptions,
} from "@tiptap/extension-bullet-list";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomBulletList = BulletList.extend<
  BulletListOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BulletListNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("bulletList")];
  },
});

export const BulletListNodeView = ({
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
        // onMouseEnter/onMouseLeave do not work on list elements living in contentEditable
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent<"ul"> as="ul" />
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
