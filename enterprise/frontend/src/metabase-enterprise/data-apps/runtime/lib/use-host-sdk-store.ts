import { useEffect, useRef } from "react";
import useDeepCompareEffect from "react-use/lib/useDeepCompareEffect";

import { getSdkStore } from "embedding-sdk-bundle/store";
import { initAuth } from "embedding-sdk-bundle/store/auth/auth";
import { setPluginsReady } from "embedding-sdk-bundle/store/reducer";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getCurrentMetabaseInstanceUrl } from "embedding-sdk-shared/lib/get-current-metabase-instance-url";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { loadCurrentUser } from "metabase/current-user";

type SdkStore = ReturnType<typeof getSdkStore>;

/**
 * Provides the host-backed SDK Redux store the data-app surface runs on.
 *
 * Forwards the caller's provider props (auth config, theme) into the SDK props
 * store the same way the SDK's own `MetabaseProvider` does, with two
 * differences that matter for correctness:
 *   - `children` is stripped — it's an unstable `ReactNode` with no meaning in
 *     the props store, and forwarding it would re-run the effect every render.
 *   - a deep-compare effect re-runs `setProps` only when prop *content* changes
 *     (e.g. `theme` arriving once the bundle loads), not on every render.
 */
export function useHostSdkStore(
  props: Partial<Omit<MetabaseProviderProps, "children">> = {},
): SdkStore {
  const storeRef = useRef<SdkStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = getSdkStore();
  }

  const store = storeRef.current;

  // Forward auth config + theme into the SDK props store. Deep-compare so it
  // only re-runs when the content changes, mirroring the SDK's MetabaseProvider.
  useDeepCompareEffect(() => {
    ensureMetabaseProviderPropsStore().setProps({
      authConfig: {
        isGuest: false,
        metabaseInstanceUrl: getCurrentMetabaseInstanceUrl(),
      },
      ...props,
    });
  }, [props]);

  // One-time init: mark the store ready and resolve auth. This must NOT re-run
  // on prop changes — re-dispatching `initAuth`/`setPluginsReady` is incorrect.
  useEffect(() => {
    ensureMetabaseProviderPropsStore().updateInternalProps({
      reduxStore: store,
      loadingState: SdkLoadingState.Loaded,
    });

    store.dispatch({ type: initAuth.fulfilled.type });
    store.dispatch(setPluginsReady(true));
    store.dispatch(loadCurrentUser());
  }, [store]);

  return store;
}
