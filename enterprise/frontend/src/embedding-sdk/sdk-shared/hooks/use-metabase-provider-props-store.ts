import { useRef, useSyncExternalStore } from "react";

import {
  EMPTY_PROPS,
  ensureMetabaseProviderPropsStore,
} from "../lib/ensure-metabase-provider-props-store";

export function useMetabaseProviderPropsStore() {
  const storeRef =
    useRef<ReturnType<typeof ensureMetabaseProviderPropsStore>>();

  if (!storeRef.current) {
    storeRef.current = ensureMetabaseProviderPropsStore();
  }

  return useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getSnapshot,
    () => EMPTY_PROPS,
  );
}
