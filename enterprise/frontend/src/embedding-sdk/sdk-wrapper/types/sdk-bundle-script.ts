export type SdkBundleScriptLoadingState = "loading" | "loaded" | "error";

export type SdkBundleScriptLoadingEvent = {
  status: SdkBundleScriptLoadingState;
};
