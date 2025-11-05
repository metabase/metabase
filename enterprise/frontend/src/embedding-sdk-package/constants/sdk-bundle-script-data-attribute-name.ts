// The SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_DASH_CASED and SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED should be in sync
// The dash-cased value is used in `document.querySelector`
// The pascal-cased value is used to properly set it via `script.dataset` (it does not accept dash-cased attribute-names)
export const SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_DASH_CASED =
  "embedding-sdk-bundle";

export const SDK_BUNDLE_SCRIPT_DATA_ATTRIBUTE_PASCAL_CASED =
  "embeddingSdkBundle";
