import { autoUpdate, useFloating } from "@floating-ui/react";
import type { Editor, NodeViewProps } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useState } from "react";

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
 * Used by Heading, Paragraph, Blockquote, BulletList, OrderedList, and CodeBlock node views.
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

  const { refs: commentsRefs, floatingStyles: commentsFloatingStyles } =
    useFloating({
      placement: "right-start",
      whileElementsMounted: autoUpdate,
      strategy: "fixed",
      open: rendered,
    });

  const { refs: anchorRefs, floatingStyles: anchorFloatingStyles } =
    useFloating({
      placement: "left",
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

  // Note: refs.setReference is stable (memoized internally by floating-ui),
  // but the refs object itself is recreated each render. Depend on the
  // stable setReference functions directly to avoid unnecessary re-renders.
  const setReferenceElement = useCallback(
    (el: HTMLElement | null) => {
      commentsRefs.setReference(el);
      anchorRefs.setReference(el);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commentsRefs.setReference, anchorRefs.setReference],
  );

  return {
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
  };
}
