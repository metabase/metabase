import { useSyncExternalStore } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";
import type { SdkStoreState } from "embedding-sdk/store/types";

const noop = () => {};

export function useLazySelector<TSelected>(
  selector: ((state: SdkStoreState) => TSelected) | null | undefined,
): TSelected | null {
  const { reduxStore } = useMetabaseProviderPropsStore();

  const subscribe = (notify: () => void) =>
    reduxStore && selector ? reduxStore.subscribe(notify) : noop;

  const getSnapshot = () =>
    reduxStore && selector ? selector(reduxStore.getState()) : null;

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
