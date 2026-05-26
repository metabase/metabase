import { getSdkStore } from "embedding-sdk-bundle/store";
import { initAuth } from "embedding-sdk-bundle/store/auth/auth";
import { setPluginsReady } from "embedding-sdk-bundle/store/reducer";
import api from "metabase/api/legacy-client";

/**
 * Returns a singleton SDK Redux store pre-marked as initialized, suitable for
 * in-host rendering of Embedding SDK components.
 *
 * Why this exists: `ComponentProvider`'s `useInitData` dispatches the real
 * `initAuth` thunk on mount, which performs an SSO/JWT/API-key handshake
 * against the configured `metabaseInstanceUrl`. That handshake is meaningful
 * only for cross-origin embedders. Inside Metabase itself we're already on
 * the same origin with a valid session cookie, so requests just work without
 * an extra handshake.
 *
 * `useInitData` short-circuits when `initStatus.status !== "uninitialized"`,
 * so dispatching `initAuth.fulfilled` once before mount is enough to skip the
 * handshake. We also flip `pluginsReady` so `PublicComponentWrapper` doesn't
 * render its loader gate forever, and pin `api.basename` to the host origin
 * since the SDK's API client reads that.
 */
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

  cachedStore = store;
  return store;
}
