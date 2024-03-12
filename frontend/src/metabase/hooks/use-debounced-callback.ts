import _ from "underscore";
import { useMemo } from "react";

export function useDebouncedCallback<T>(
  callback: (...args: any[]) => T,
  delay: number,
  deps: any[],
) {
  return useMemo(() => {
    return _.debounce(callback, delay);
  }, [...deps, delay]); // eslint-disable-line react-hooks/exhaustive-deps
}
