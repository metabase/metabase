import type { SdkStoreState } from "embedding-sdk/store/types";
import type { State } from "metabase-types/store";

export const getLoginStatus = (state: SdkStoreState) => state.sdk?.loginStatus;

export const getIsInitialized = (state: SdkStoreState) =>
  getLoginStatus(state).status !== "uninitialized";

export const getIsLoggedIn = (state: SdkStoreState) =>
  getLoginStatus(state).status === "success";

export const getSessionTokenState = (state: SdkStoreState) => state.sdk.token;

export const getPlugins = (state: SdkStoreState) => state.sdk.plugins;

export const getEventHandlers = (state: SdkStoreState | State) =>
  "sdk" in state ? state.sdk.eventHandlers : null;

export const getLicenseProblem = (state: SdkStoreState) =>
  state.sdk.licenseProblem;

export const getLoaderComponent = (state: SdkStoreState) =>
  state.sdk.loaderComponent;

export const getErrorComponent = (state: SdkStoreState) =>
  state.sdk.errorComponent;

export const getMetabaseInstanceUrl = (state: SdkStoreState) =>
  state.sdk?.metabaseInstanceUrl;

export const getFetchRefreshTokenFn = (state: SdkStoreState) =>
  state.sdk.fetchRefreshTokenFn;
