import { useCallback, useSyncExternalStore } from "react";

import { MetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/lib/metabase-provider-props-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

export function useLazySelector<TSelected>(
  selector: ((state: SdkStoreState) => TSelected) | null | undefined,
): TSelected | null {
  const getSnapshot = useCallback((): TSelected | null => {
    const reduxStore =
      MetabaseProviderPropsStore.getInstance()?.props?.reduxStore;

    if (!reduxStore || !selector) {
      return null;
    }

    return selector(reduxStore.getState());
  }, [selector]);

  const subscribe = useCallback(
    (callback: () => void) => {
      const reduxStore =
        MetabaseProviderPropsStore.getInstance()?.props?.reduxStore;

      if (!reduxStore || !selector) {
        return () => {};
      }

      let prev = getSnapshot();

      const unsubscribe = reduxStore.subscribe(() => {
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
