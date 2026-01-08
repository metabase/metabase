import { useEffect, useRef } from "react";

import styles from "../components/DocumentPage.module.css";

interface UseScrollToAnchorOptions {
  /** The block ID to scroll to (from location.hash, without the #) */
  blockId: string | null;
  /** Ref to the editor's DOM container */
  editorContainerRef: React.RefObject<HTMLElement>;
  /** Whether the document is still loading */
  isLoading: boolean;
}

/**
 * Scrolls to and highlights a block element when navigating with an anchor hash.
 * Uses MutationObserver to wait for the element to appear in the DOM.
 */
export function useScrollToAnchor({
  blockId,
  editorContainerRef,
  isLoading,
}: UseScrollToAnchorOptions): void {
  // Track the currently highlighted element for cleanup
  const highlightedElementRef = useRef<Element | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    // Early exit if no target or still loading
    if (!blockId || isLoading || !editorContainerRef.current) {
      return;
    }

    const container = editorContainerRef.current;

    const scrollToElement = (element: Element) => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add(styles.highlighted);
      highlightedElementRef.current = element;

      // Remove highlight class after animation completes
      highlightTimeoutRef.current = setTimeout(() => {
        element.classList.remove(styles.highlighted);
        highlightedElementRef.current = null;
      }, 2000);
    };

    // Try to find element immediately (it might already exist)
    const selector = `[data-node-id="${CSS.escape(blockId)}"]`;
    let observer: MutationObserver | null = null;

    const existingElement = container.querySelector(selector);
    if (existingElement) {
      scrollToElement(existingElement);
    } else {
      // Element not found yet – watch for DOM mutations
      observer = new MutationObserver(() => {
        const element = container.querySelector(selector);
        if (element) {
          observer?.disconnect();
          observer = null;
          scrollToElement(element);
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
      });
    }

    // Cleanup
    return () => {
      observer?.disconnect();
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
      if (highlightedElementRef.current) {
        highlightedElementRef.current.classList.remove(styles.highlighted);
      }
    };
  }, [blockId, editorContainerRef, isLoading]);
}
