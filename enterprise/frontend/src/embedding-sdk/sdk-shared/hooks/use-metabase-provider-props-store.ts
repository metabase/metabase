import { useRef, useSyncExternalStore } from "react";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

export function useMetabaseProviderPropsStore() {
  const storeRef = useRef<ReturnType<typeof ensureMetabaseProviderPropsStore>>(
    ensureMetabaseProviderPropsStore(),
  );

  const props = useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getSnapshot,
    storeRef.current.getSnapshot,
  );

  return {
    props,
    store: storeRef.current,
  };
}
