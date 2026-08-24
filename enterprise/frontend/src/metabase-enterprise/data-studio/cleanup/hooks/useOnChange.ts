import { useEffect, useRef } from "react";
import { useLatest } from "react-use";

const UNSET = Symbol("unset");

type UseOnChangeOptions = {
  enabled?: boolean;
};

/**
 * Runs `onChange` when `value` differs from the value seen on a previous
 * enabled run. Never fires on the run that first observes `value`, so a
 * component's initial load doesn't look like a change.
 */
export function useOnChange<T>(
  value: T,
  onChange: (value: T) => void,
  { enabled = true }: UseOnChangeOptions = {},
) {
  const previous = useRef<T | typeof UNSET>(UNSET);
  const onChangeRef = useLatest(onChange);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (previous.current !== UNSET && previous.current !== value) {
      onChangeRef.current(value);
    }
    previous.current = value;
  }, [value, enabled, onChangeRef]);
}
