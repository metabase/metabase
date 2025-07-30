export type SdkBundleScriptLoadingState =
  | "not-started-loading"
  | "loading"
  | "loaded"
  | "error";

export type SdkBundleScriptLoadingEvent = {
  status: SdkBundleScriptLoadingState;
};
