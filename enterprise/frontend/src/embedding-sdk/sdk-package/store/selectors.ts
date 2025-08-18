import type { SdkStoreState } from "embedding-sdk/store/types";

export const getSdkBundleVersion = (state: SdkStoreState) =>
  state.settings.values.version.tag;
