import { useCallback, useSyncExternalStore } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

const noop = () => {};

/**
 * This hook works with lazy-loaded Redux store for of the Embedding SDK Bundle
 * While the bundle is not loaded, it returns `null`.
 * After the bundle is loaded, it returns the selected state from the Redux store.
 */
export function useLazySelector<TSelected>(
  selector: ((state: SdkStoreState) => TSelected) | null | undefined,
): TSelected | null {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const subscribe = useCallback(
    (notify: () => void) =>
      reduxStore && selector ? reduxStore.subscribe(notify) : noop,
    [reduxStore, selector],
  );

  const getSnapshot = useCallback(
    () => (reduxStore && selector ? selector(reduxStore.getState()) : null),
    [reduxStore, selector],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
