import { useCallback, useSyncExternalStore } from "react";

import { MetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/metabase-provider-props-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

export function useLazySelector<TSelected>(
  selector: ((state: SdkStoreState) => TSelected) | null | undefined,
): TSelected | null {
  const getSnapshot = useCallback((): TSelected | null => {
    const store = MetabaseProviderPropsStore.getInstance()?.getSdkStore();

    if (!store || !selector) {
      return null;
    }

    return selector(store.getState());
  }, [selector]);

  const subscribe = useCallback(
    (callback: () => void) => {
      const store = MetabaseProviderPropsStore.getInstance()?.getSdkStore();

      if (!store || !selector) {
        return () => {};
      }

      let prev = getSnapshot();

      const unsubscribe = store.subscribe(() => {
        const next = getSnapshot();

        if (prev !== next) {
          prev = next;
          callback();
        }
      });

      return unsubscribe;
    },
    [selector, getSnapshot],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
