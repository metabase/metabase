import { useMemo } from "react";
import _ from "underscore";

export function useDebouncedCallback<T>(
  callback: (...args: any[]) => T,
  delay: number,
  deps: any[],
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => _.debounce(callback, delay), [...deps, delay]);
}
