import { type MutableRefObject, type Ref, useCallback, useRef } from "react";

/**
 * Merges a forwarded ref with a local ref, returning a callback ref
 * and the local ref object for direct access.
 */
export function useMergedRef<T extends HTMLElement>(
  forwardedRef: Ref<T>,
): [ref: (node: T | null) => void, localRef: MutableRefObject<T | null>] {
  const localRef = useRef<T | null>(null);

  const setRef = useCallback(
    (node: T | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as MutableRefObject<T | null>).current = node;
      }
    },
    [forwardedRef],
  );

  return [setRef, localRef];
}
