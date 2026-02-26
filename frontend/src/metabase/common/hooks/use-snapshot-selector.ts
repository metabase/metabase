import { type DependencyList, useEffect, useRef } from "react";

import { useStore } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

/**
 * This hook is similar to useSelector, but it doesn't trigger re-renders when the slice changes.
 * Instead, it uses the deps array as a signal to capture a snapshot of the slice.
 * This is especially useful when working with frequent or expensive selectors like getMetadata.
 */
export const useSnapshotSelector = <T>(
  selector: (state: State) => T,
  deps: DependencyList,
): T => {
  const store = useStore();
  const valueRef = useRef(selector(store.getState()));

  useEffect(() => {
    valueRef.current = selector(store.getState());
  }, [store, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return valueRef.current;
};
