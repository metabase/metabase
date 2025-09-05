import { useRef } from "react";
import { isEqual } from "underscore";

/**
 * Use `_.isEqual` to deep compare the passed value and return the old value if it
 * hasn't changed, used to return a stable reference needed in dependencies of
 * other hooks.
 */
export function useMemoizedValue<T>(value: T): T {
  const ref = useRef<T>(value);

  if (!isEqual(ref.current, value)) {
    ref.current = value;
  }

  return ref.current;
}
