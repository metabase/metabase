import { useCallback, useEffect, useRef, useState } from "react";
import * as React from "react";

interface ListKeyboardNavigationInput<T> {
  ref?: React.MutableRefObject<any>;
  list: T[];
  onEnter: (item: T) => void;
  resetOnListChange?: boolean;
}

export const useListKeyboardNavigation = <T>({
  ref,
  list,
  onEnter,
  resetOnListChange = true,
}: ListKeyboardNavigationInput<T>) => {
  const selectedRef = useRef<HTMLElement | null>();
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

  const handleKeyDown = useCallback(
    ({ key }: KeyboardEvent) => {
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
