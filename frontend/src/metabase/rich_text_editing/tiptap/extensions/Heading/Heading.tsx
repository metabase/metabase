import type { NodeViewProps } from "@tiptap/core";
import { Heading, type HeadingOptions } from "@tiptap/extension-heading";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomHeading = Heading.extend<HeadingOptions & BlockNodeOptions>({
  addAttributes() {
    return {
      level: {
        default: 1,
        rendered: false,
      },
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HeadingNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("heading")];
  },
});

type Level = 1 | 2 | 3 | 4 | 5 | 6;

type ElementType = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

const levelNodeMap: Record<Level, ElementType> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
};

export const HeadingNodeView = ({
  node,
  editor,
  getPos,
  extension,
}: NodeViewProps) => {
  const { level } = node.attrs;
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
        <NodeViewContent<ElementType>
          as={levelNodeMap[level as Level] ?? "h1"}
        />
      </NodeViewWrapper>

      {shouldShowMenus && document && (
        <>
          <AnchorLinkMenu
            ref={anchorRefs.setFloating}
            show={hovered}
            style={anchorFloatingStyles}
            url={anchorUrl}
          />
          <CommentsMenu
            active={isOpen}
            childTargetId={_id}
            ref={commentsRefs.setFloating}
            show={isOpen || hovered}
            style={commentsFloatingStyles}
            unresolvedCommentsCount={unresolvedCommentsCount}
          />
        </>
      )}
    </>
  );
};
