import type { SdkStoreState } from "embedding-sdk/store/types";

export const getLoginStatus = (state: SdkStoreState) => state.sdk.loginStatus;

export const getIsInitialized = (state: SdkStoreState) =>
  getLoginStatus(state).status !== "uninitialized";

export const getIsLoggedIn = (state: SdkStoreState) =>
  getLoginStatus(state).status === "success";

export const getSessionTokenState = (state: SdkStoreState) => state.sdk.token;

export const getPlugins = (state: SdkStoreState) => state.sdk.plugins;

export const getLoaderComponent = (state: SdkStoreState) =>
  state.sdk.loaderComponent;

export const getErrorComponent = (state: SdkStoreState) =>
  state.sdk.errorComponent;
