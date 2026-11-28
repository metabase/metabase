import { type RefObject, useLayoutEffect } from "react";

/**
 * Moves the focus to `fallbackRef` when the calling component unmounts while the focus is inside
 * the container, so that the focus doesn't drop to the page body.
 *
 * The container must stay rendered while the component is mounted, for example as its root
 * element. The hook reads the container when it mounts, so it ignores one that is replaced later.
 *
 * The check runs before React removes the container. The focus moves after the removal, and only
 * if nothing else has taken the focus meanwhile.
 */
export function useFocusFallback(
  containerRef: RefObject<HTMLElement | null>,
  fallbackRef: RefObject<HTMLElement | null> | null | undefined,
) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    return () => {
      if (fallbackRef && container?.contains(document.activeElement)) {
        queueMicrotask(() => focusFallback(container, fallbackRef));
      }
    };
  }, [containerRef, fallbackRef]);
}

function focusFallback(
  container: HTMLElement,
  fallbackRef: RefObject<HTMLElement | null>,
) {
  const fallback = fallbackRef.current;
  const { activeElement } = document;
  const isFocusLost = activeElement === null || activeElement === document.body;
  if (!container.isConnected && isFocusLost && fallback?.isConnected) {
    fallback.focus();
  }
}
