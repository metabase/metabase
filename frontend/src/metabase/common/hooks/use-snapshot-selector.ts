import { type DependencyList, useEffect, useRef } from "react";

import { useStore } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

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
