import { autoUpdate, useFloating } from "@floating-ui/react";
import type { Editor, NodeViewProps } from "@tiptap/core";
import { useCallback, useEffect, useState } from "react";

import { useNodeInViewport } from "metabase/documents/hooks/use-node-in-viewport";
import { useUnresolvedCommentsCount } from "metabase/documents/hooks/use-unresolved-comments-count";
import {
  getChildTargetId,
  getCurrentDocument,
  getHoveredChildTargetId,
} from "metabase/documents/selectors";
import { isTopLevel } from "metabase/documents/utils/editorNodeUtils";
import { useSelector } from "metabase/redux";
import { isWithinIframe } from "metabase/utils/iframe";
import { documentWithAnchor } from "metabase/utils/urls";

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
  const { _id } = node.attrs;

  const { ref: viewportRef, isInViewport } = useNodeInViewport();

  const unresolvedCommentsCount = useUnresolvedCommentsCount(_id, {
    skip: !isInViewport,
  });

  const [hovered, setHovered] = useState(false);
  const [rendered, setRendered] = useState(false);

  const isOpen = childTargetId === _id;
  const isHovered = hoveredChildTargetId === _id;

  const floatingOpen = rendered && isInViewport;

  const { refs: commentsRefs, floatingStyles: commentsFloatingStyles } =
    useFloating({
      placement: "right-start",
      whileElementsMounted: autoUpdate,
      strategy: "fixed",
      open: floatingOpen,
    });

  const { refs: anchorRefs, floatingStyles: anchorFloatingStyles } =
    useFloating({
      placement: "left",
      whileElementsMounted: autoUpdate,
      strategy: "fixed",
      open: floatingOpen,
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
    isInViewport &&
    !shouldHideMenus &&
    isTopLevelBlock &&
    !isWithinIframe() &&
    hasContent;
  const anchorUrl = document ? documentWithAnchor(document, _id) : "";

  // Merges the viewport IntersectionObserver ref with the floating-ui
  // reference setters into a single stable callback ref.
  const setReferenceElement = useCallback(
    (el: HTMLElement | null) => {
      viewportRef(el);
      commentsRefs.setReference(el);
      anchorRefs.setReference(el);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewportRef, commentsRefs.setReference, anchorRefs.setReference],
  );

  return {
    _id,
    isOpen,
    isHovered,
    hovered,
    setHovered,
    unresolvedCommentsCount,
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
