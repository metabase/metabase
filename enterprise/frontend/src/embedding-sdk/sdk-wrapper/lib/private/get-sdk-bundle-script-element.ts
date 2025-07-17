import { SCRIPT_TAG_DATA_ATTRIBUTE_DASH_CASED } from "embedding-sdk/sdk-wrapper/config";

export function getSdkBundleScriptElement() {
  return document.querySelector(
    `[data-${SCRIPT_TAG_DATA_ATTRIBUTE_DASH_CASED}="true"]`,
  );
}
