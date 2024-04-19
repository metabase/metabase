import type { SdkStoreState } from "embedding-sdk/store/types";

export const getLoginStatus = (state: SdkStoreState) => state.sdk.loginStatus;

export const getIsInitialized = (state: SdkStoreState) =>
  state.sdk.loginStatus.status !== "uninitialized";

export const getIsLoggedIn = (state: SdkStoreState) =>
  getLoginStatus(state).status === "success";

export const getSessionTokenState = (state: SdkStoreState) => state.sdk.token;
