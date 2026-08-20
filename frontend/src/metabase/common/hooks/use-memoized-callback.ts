import { useMemo } from "react";

import { memoize } from "metabase/utils/memoize";

export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList = [],
): T {
  return useMemo(() => {
    // Unjustified type cast. FIXME
    return memoize((...args: Parameters<T>): ReturnType<T> => {
      return callback(...args);
    }) as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
