import { SDK_BUNDLE_SCRIPT_LOADING_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { SdkBundleScriptLoadingEvent } from "embedding-sdk/sdk-wrapper/types/sdk-bundle-script";

export function dispatchSdkBundleScriptLoadingEvent(
  status: SdkBundleScriptLoadingEvent["status"],
) {
  const sdkLoadingEvent = new CustomEvent<SdkBundleScriptLoadingEvent>(
    SDK_BUNDLE_SCRIPT_LOADING_EVENT_NAME,
    {
      bubbles: true,
      composed: true,
      detail: {
        status,
      },
    },
  );

  document.dispatchEvent(sdkLoadingEvent);
}
