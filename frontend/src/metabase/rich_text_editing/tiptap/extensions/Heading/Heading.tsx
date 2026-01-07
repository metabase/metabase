import { autoUpdate, useFloating } from "@floating-ui/react";
import type { NodeViewProps } from "@tiptap/core";
import { Heading } from "@tiptap/extension-heading";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import cx from "classnames";
import { useEffect, useMemo, useState } from "react";

import { useListCommentsQuery } from "metabase/api";
import { getTargetChildCommentThreads } from "metabase/comments/utils";
import { AnchorLinkMenu } from "metabase/documents/components/Editor/AnchorLinkMenu";
import { CommentsMenu } from "metabase/documents/components/Editor/CommentsMenu";
import {
  getChildTargetId,
  getCurrentDocument,
  getHoveredChildTargetId,
} from "metabase/documents/selectors";
import { getListCommentsQuery } from "metabase/documents/utils/api";
import { isTopLevel } from "metabase/documents/utils/editorNodeUtils";
import { isWithinIframe } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import { documentWithAnchor } from "metabase/lib/urls";

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
  const childTargetId = useSelector(getChildTargetId);
  const hoveredChildTargetId = useSelector(getHoveredChildTargetId);
  const document = useSelector(getCurrentDocument);
  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(document),
  );
  const comments = commentsData?.comments;
  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false); // floating ui wrongly positions things without this
  const { _id, level } = node.attrs;
  const isOpen = childTargetId === _id;
  const isHovered = hoveredChildTargetId === _id;
  const threads = useMemo(
    () => getTargetChildCommentThreads(comments, _id),
    [comments, _id],
  );

  // Comments menu floating (right side)
  const { refs: commentsRefs, floatingStyles: commentsFloatingStyles } =
    useFloating({
      placement: "right-start",
      whileElementsMounted: autoUpdate,
      strategy: "fixed",
      open: rendered,
    });

  // Anchor link menu floating (left side)
  const { refs: anchorRefs, floatingStyles: anchorFloatingStyles } =
    useFloating({
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

  const isTopLevelBlock = isTopLevel({ editor, getPos });
  const hasContent = node.textContent.trim().length > 0;
  const shouldShowMenus =
    document && rendered && isTopLevelBlock && !isWithinIframe() && hasContent;
  const anchorUrl = document ? documentWithAnchor(document, _id) : "";

  return (
    <>
      <NodeViewWrapper
        aria-expanded={isOpen}
        className={cx(S.root, {
          [S.open]: isOpen || isHovered,
        })}
        ref={(el: HTMLElement | null) => {
          commentsRefs.setReference(el);
          anchorRefs.setReference(el);
        }}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <NodeViewContent<ElementType>
          as={levelNodeMap[level as Level] ?? "h1"}
        />
      </NodeViewWrapper>

      {shouldShowMenus && (
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
            threads={threads}
            style={commentsFloatingStyles}
          />
        </>
      )}
    </>
  );
};
