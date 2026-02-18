import type { NodeViewProps } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";

import { AnchorLinkMenu } from "metabase/documents/components/Editor/AnchorLinkMenu";
import { CommentsMenu } from "metabase/documents/components/Editor/CommentsMenu";
import { useBlockMenus } from "metabase/documents/hooks/use-block-menus";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import S from "../extensions.module.css";

export const CustomHeading = Heading.extend({
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
    return [createProseMirrorPlugin(Heading.name)];
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

export const HeadingNodeView = ({ node, editor, getPos }: NodeViewProps) => {
  const { level } = node.attrs;

  const {
    _id,
    isOpen,
    isHovered,
    hovered,
    setHovered,
    threads,
    document,
    shouldShowMenus,
    anchorUrl,
    setReferenceElement,
    commentsRefs,
    commentsFloatingStyles,
    anchorRefs,
    anchorFloatingStyles,
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
            href={`/document/${document.id}/comments/${_id}`}
            ref={commentsRefs.setFloating}
            show={isOpen || hovered}
            style={commentsFloatingStyles}
            threads={threads}
          />
        </>
      )}
    </>
  );
};
