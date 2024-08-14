import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface ListKeyboardNavigationInput<T, R> {
  ref?: MutableRefObject<R | null>;
  list: T[];
  onEnter: (item: T) => void;
  resetOnListChange?: boolean;
}

export const useListKeyboardNavigation = <
  T,
  R extends HTMLElement = HTMLElement,
>({
  ref,
  list,
  onEnter,
  resetOnListChange = true,
}: ListKeyboardNavigationInput<T, R>) => {
  const selectedRef = useRef<R | null>(null);
  const [cursorIndex, setCursorIndex] = useState<number | null>(null);

  const reset = useCallback(() => setCursorIndex(null), []);

  useEffect(() => {
    if (resetOnListChange) {
      reset();
    }
  }, [list, reset, resetOnListChange]);

  useEffect(() => {
    selectedRef?.current?.scrollIntoView({
      block: "nearest",
    });
  }, [cursorIndex]);

  const handleKeyDown: EventListener = useCallback(
    event => {
      const { key } = event as KeyboardEvent;
      switch (key) {
        case "ArrowDown":
          setCursorIndex(((cursorIndex ?? -1) + 1) % list.length);
          break;
        case "ArrowUp":
          setCursorIndex((list.length + (cursorIndex ?? 0) - 1) % list.length);
          break;
        case "Enter":
          if (cursorIndex != null && !isNaN(cursorIndex)) {
            onEnter(list[cursorIndex]);
          }
          break;
      }
    },
    [cursorIndex, list, onEnter],
  );

  useEffect(() => {
    const element = ref?.current ?? window;
    element.addEventListener("keydown", handleKeyDown);
    return () => element.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, ref]);

  const selectedItem = cursorIndex != null ? list?.[cursorIndex] : null;

  return {
    reset,
    cursorIndex,
    selectedItem,
    getRef: (item: T) => (item === selectedItem ? selectedRef : undefined),
  };
};
