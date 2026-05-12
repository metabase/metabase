import { useCallback, useSyncExternalStore } from "react";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

export function useMetabaseProviderPropsStore() {
  // Re-resolve the store on every subscribe/snapshot call rather than capturing
  // it in a closure. `cleanup()` resets state in place and reuses the same
  // singleton, so this is mostly defensive — but it also keeps the hook
  // resilient if the singleton implementation ever swaps the underlying object.
  const subscribe = useCallback(
    (listener: () => void) =>
      ensureMetabaseProviderPropsStore().subscribe(listener),
    [],
  );
  const getSnapshot = useCallback(
    () => ensureMetabaseProviderPropsStore().getState(),
    [],
  );

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    state,
    store: ensureMetabaseProviderPropsStore(),
  };
}
