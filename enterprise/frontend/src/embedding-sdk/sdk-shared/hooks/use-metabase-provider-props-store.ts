import { useEffect, useRef, useSyncExternalStore } from "react";

import { ensureMetabaseProviderPropsStore } from "../lib/ensure-metabase-provider-props-store";

export function useMetabaseProviderPropsStore() {
  const storeRef =
    useRef<ReturnType<typeof ensureMetabaseProviderPropsStore>>();

  if (!storeRef.current) {
    storeRef.current = ensureMetabaseProviderPropsStore();
  }

  useEffect(() => {
    // To handle strict mode case when the component is remounted, and the `storeRef.current` is cleaned up
    if (!storeRef.current) {
      storeRef.current = ensureMetabaseProviderPropsStore();
    }

    return () => {
      storeRef.current = undefined;
    };
  }, []);

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
