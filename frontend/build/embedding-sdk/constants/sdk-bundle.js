const SDK_BUNDLE_PATH = "app/embedding-sdk";
module.exports.SDK_BUNDLE_PATH = SDK_BUNDLE_PATH;

const SDK_BUNDLE_LEGACY_PATH = `${SDK_BUNDLE_PATH}/legacy`;
module.exports.SDK_BUNDLE_LEGACY_PATH = SDK_BUNDLE_LEGACY_PATH;

const SDK_BUNDLE_FILENAME = "embedding-sdk.js";
module.exports.SDK_BUNDLE_FILENAME = "embedding-sdk.js";

// Single URL used by the NPM package for all scenarios.
// The backend decides what to serve based on query params:
// - packageVersion present (no useLegacyMonolithicBundle) → bootstrap
// - packageVersion + useLegacyMonolithicBundle=true → legacy monolithic
// - no params (old packages) → legacy monolithic
module.exports.SDK_BUNDLE_FULL_PATH = `app/${SDK_BUNDLE_FILENAME}`;

module.exports.SDK_BUNDLE_BOOTSTRAP_FILENAME = "embedding-sdk.js";
