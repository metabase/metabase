import { useMemo } from "react";

import { memoize } from "metabase/utils/memoize";

export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList = [],
): (...args: Parameters<T>) => ReturnType<T> {
  return useMemo(
    () => memoize((...args: Parameters<T>): ReturnType<T> => callback(...args)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );
}
