import { useCallback, useSyncExternalStore } from "react";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

export function useMetabaseProviderPropsStore() {
  // Re-resolve the store from `window` on every subscribe/snapshot call.
  // `cleanup()` deletes the window key, and the next `ensureMetabaseProviderPropsStore()`
  // creates a fresh store. Holding a `useRef`'d store across React StrictMode's
  // simulated unmount/remount cycle would leave the component reading from a
  // stale store object while writes (via direct `ensureMetabaseProviderPropsStore()`
  // calls in effects) target the current one.
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
