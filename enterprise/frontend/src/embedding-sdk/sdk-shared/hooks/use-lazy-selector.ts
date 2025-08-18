import { useCallback, useSyncExternalStore } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

const noop = () => {};

export function useLazySelector<TSelected>(
  selector: ((state: SdkStoreState) => TSelected) | null | undefined,
): TSelected | null {
  const {
    props: { reduxStore },
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
