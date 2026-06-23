import type { NodeViewProps } from "@tiptap/core";
import { Paragraph, type ParagraphOptions } from "@tiptap/extension-paragraph";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomParagraph = Paragraph.extend<
  ParagraphOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ParagraphNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("paragraph")];
  },
});

export const ParagraphNodeView = ({
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
        <NodeViewContent<"p"> as="p" />
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
