import { useCallback, useRef, useState } from "react";
import { useUnmount } from "react-use";

/**
 * A hook that temporarily changes the value of a stateful value
 * and automatically resets it to the baseValue after the specified
 * amount of time.
 *
 * Ideal for feedback message on buttons that are clicked.
 */
export function useTemporaryState<T>(
  baseValue: T,
  ms: number,
): [T, (newValue: T) => void] {
  const [value, setValue] = useState(baseValue);
  const timeoutIdRef = useRef<number>();

  const changeValue = useCallback(
    (newValue: T) => {
      setValue(newValue);
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = window.setTimeout(() => setValue(baseValue), ms);
    },
    [baseValue, ms],
  );

  useUnmount(() => {
    window.clearTimeout(timeoutIdRef.current);
  });

  return [value, changeValue];
}
