import { useRef, useSyncExternalStore } from "react";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

export function useMetabaseProviderPropsStore() {
  const storeRef = useRef<ReturnType<typeof ensureMetabaseProviderPropsStore>>(
    ensureMetabaseProviderPropsStore(),
  );

  const state = useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getState,
    storeRef.current.getState,
  );

  const store = storeRef.current;

  return {
    state,
    store,
  };
}
