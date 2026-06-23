import type { NodeViewProps } from "@tiptap/core";
import {
  OrderedList,
  type OrderedListOptions,
} from "@tiptap/extension-ordered-list";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomOrderedList = OrderedList.extend<
  OrderedListOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          return element.hasAttribute("start")
            ? parseInt(element.getAttribute("start") || "", 10)
            : 1;
        },
      },
      type: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("type"),
      },
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(OrderedListNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin("orderedList")];
  },
});

export const OrderedListNodeView = ({
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
        <NodeViewContent<"ol"> as="ol" />
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
