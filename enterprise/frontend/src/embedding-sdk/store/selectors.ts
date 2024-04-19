import type { SdkStoreState } from "embedding-sdk/store/types";

export const getIsLoggedIn = (state: SdkStoreState) => state.sdk.isLoggedIn;
export const getIsInitialized = (state: SdkStoreState) =>
  state.sdk.isInitialized;
export const getSessionTokenState = (state: SdkStoreState) => state.sdk.token;
