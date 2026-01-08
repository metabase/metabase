import { autoUpdate, useFloating } from "@floating-ui/react";
import type { Editor, NodeViewProps } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";

import { useListCommentsQuery } from "metabase/api";
import { getTargetChildCommentThreads } from "metabase/comments/utils";
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

interface UseBlockMenusOptions {
  node: NodeViewProps["node"];
  editor: Editor;
  getPos: NodeViewProps["getPos"];
  /**
   * Additional condition to hide menus (e.g., for comments context)
   */
  shouldHideMenus?: boolean;
}

/**
 * Shared hook for block-level floating menus (anchor links on left, comments on right).
 * Used by Heading, Paragraph, and Blockquote node views.
 */
export function useBlockMenus({
  node,
  editor,
  getPos,
  shouldHideMenus = false,
}: UseBlockMenusOptions) {
  const childTargetId = useSelector(getChildTargetId);
  const hoveredChildTargetId = useSelector(getHoveredChildTargetId);
  const document = useSelector(getCurrentDocument);
  const { data: commentsData } = useListCommentsQuery(
    getListCommentsQuery(document),
  );
  const comments = commentsData?.comments;
  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false);

  const { _id } = node.attrs;
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
    document &&
    rendered &&
    !shouldHideMenus &&
    isTopLevelBlock &&
    !isWithinIframe() &&
    hasContent;
  const anchorUrl = document ? documentWithAnchor(document, _id) : "";

  // Ref callback to set both floating references
  const setReferenceElement = (el: HTMLElement | null) => {
    commentsRefs.setReference(el);
    anchorRefs.setReference(el);
  };

  return {
    // State
    _id,
    isOpen,
    isHovered,
    hovered,
    setHovered,
    threads,
    document,

    // Menu visibility
    shouldShowMenus,
    anchorUrl,

    // Floating refs and styles
    setReferenceElement,
    commentsRefs,
    commentsFloatingStyles,
    anchorRefs,
    anchorFloatingStyles,
  };
}
