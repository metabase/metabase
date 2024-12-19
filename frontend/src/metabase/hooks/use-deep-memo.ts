import { type DependencyList, useRef } from "react";
import _ from "underscore";

export const useDeepMemo = <T>(factory: () => T, deps: DependencyList) => {
  const previousDeps = useRef<DependencyList>();
  const memoizedValue = useRef<T>();

  if (!previousDeps.current || !_.isEqual(previousDeps.current, deps)) {
    previousDeps.current = deps;
    memoizedValue.current = factory();
  }

  return memoizedValue.current;
};
