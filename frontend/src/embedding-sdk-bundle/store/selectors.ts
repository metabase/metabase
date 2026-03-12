import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import { getSetting } from "metabase/selectors/settings";
import { getTokenFeature } from "metabase/setup";
import type { State } from "metabase-types/store";

export const getIsGuestEmbedRaw = (state: SdkStoreState) =>
  state.sdk?.isGuestEmbed;

export const getIsGuestEmbed = (state: SdkStoreState) =>
  Boolean(state.sdk?.isGuestEmbed);

export const getInitStatus = (state: SdkStoreState) => state.sdk?.initStatus;

export const getLoginStatus = (state: SdkStoreState) => state.sdk?.initStatus;

export const getIsInitialized = (state: SdkStoreState) =>
  getInitStatus(state).status !== "uninitialized";

export const getIsLoggedIn = (state: SdkStoreState) =>
  getLoginStatus(state).status === "success";

export const getSessionTokenState = (state: SdkStoreState) => state.sdk.token;

export const getPlugins = (state: SdkStoreState) => state.sdk.plugins;

export const getEventHandlers = (state: SdkStoreState | State) =>
  "sdk" in state ? state.sdk.eventHandlers : null;

export const getUsageProblem = (state: SdkStoreState) => state.sdk.usageProblem;

export const getErrorComponent = (state: SdkStoreState) =>
  state.sdk.errorComponent;

export const getError = (state: SdkStoreState) => state.sdk.error;

export const getMetabaseInstanceUrl = (state: SdkStoreState) =>
  state.sdk?.metabaseInstanceUrl;

export const getMetabaseInstanceVersion = (state: SdkStoreState) =>
  state.sdk?.metabaseInstanceVersion ?? getSetting(state, "version")?.tag;

export const getFetchRefreshTokenFn = (state: SdkStoreState) =>
  state.sdk.fetchRefreshTokenFn;

export const getAvailableFonts = (state: SdkStoreState) =>
  getSetting(state, "available-fonts");

export const getHasTokenFeature = (state: SdkStoreState) => {
  // When the setting haven't been loaded or failed to query, we assume that the
  // feature is _enabled_ first.
  if (!state.settings.values?.["token-features"]) {
    return true;
  }

  return getTokenFeature(state, EMBEDDING_SDK_CONFIG.tokenFeatureKey);
};
