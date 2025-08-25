import { SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_DASH_CASED } from "embedding-sdk-package/constants/sdk-bundle-script-data-attribute-name";

export function getSdkBundleScriptElement(): HTMLScriptElement | null {
  return document.querySelector(
    `[data-${SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_DASH_CASED}="true"]`,
  );
}
