import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_DASH_CASED } from "embedding-sdk/sdk-wrapper/config";

export function getSdkBundleScriptElement() {
  return document.querySelector(
    `[data-${SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_DASH_CASED}="true"]`,
  );
}
