import { executeAction } from "embedding-sdk-bundle/lib/execute-action";
import { queryDataset } from "embedding-sdk-bundle/lib/query-dataset";
import { queryMetric } from "embedding-sdk-bundle/lib/query-metric";
import { queryQuestion } from "embedding-sdk-bundle/lib/query-question";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { initAuth } from "embedding-sdk-bundle/store/auth/auth";
import { setPluginsReady } from "embedding-sdk-bundle/store/reducer";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import { api } from "metabase/api/client";

let cachedStore: ReturnType<typeof getSdkStore> | null = null;

export function getHostBackedSdkStore() {
  if (cachedStore) {
    return cachedStore;
  }
  const store = getSdkStore();

  // Jump `initStatus` straight to "success" by replaying the fulfilled action
  // the reducer already handles. No real auth happens.
  store.dispatch({ type: initAuth.fulfilled.type });
  store.dispatch(setPluginsReady(true));

  // Same-origin: the SDK's API client uses this as the request base; it must
  // match where the host is served from so session cookies are sent.
  api.basename = window.location.origin;

  // Populate only the SDK-bundle exports the package hooks actually read.
  // Cast to `Partial<…>` because the full `MetabaseEmbeddingSdkBundleExports`
  // type requires every component / helper, but in-host the package hooks
  // only dereference `queryQuestion` and `getLoginStatus`.
  const win = getWindow();

  if (win) {
    win.METABASE_EMBEDDING_SDK_BUNDLE = {
      ...(win.METABASE_EMBEDDING_SDK_BUNDLE ?? {}),
      queryMetric,
      queryQuestion,
      queryDataset,
      executeAction,
      getLoginStatus,
    } as typeof win.METABASE_EMBEDDING_SDK_BUNDLE;
  }

  // (2) `ComponentProvider` normally calls
  // `ensureMetabaseProviderPropsStore().updateInternalProps({ reduxStore })`
  // so package hooks can reach the SDK store via
  // `useMetabaseProviderPropsStore()`. We don't render `ComponentProvider`,
  // so push our pre-initialized store in directly.
  ensureMetabaseProviderPropsStore().updateInternalProps({
    reduxStore: store,
  });

  cachedStore = store;
  return store;
}
