import { useMemo } from "react";
import _ from "underscore";

export function useDebouncedCallback<T>(
  callback: (...args: any[]) => T,
  delay: number,
  deps: any[],
) {
  return useMemo(() => {
    return _.debounce(callback, delay);
  }, [...deps, delay]); // eslint-disable-line react-hooks/exhaustive-deps
}
