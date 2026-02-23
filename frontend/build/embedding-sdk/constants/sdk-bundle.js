const SDK_BUNDLE_PATH = "app/embedding-sdk";
module.exports.SDK_BUNDLE_PATH = SDK_BUNDLE_PATH;

const SDK_BUNDLE_LEGACY_PATH = `${SDK_BUNDLE_PATH}/legacy`;
module.exports.SDK_BUNDLE_LEGACY_PATH = SDK_BUNDLE_LEGACY_PATH;

const SDK_BUNDLE_CHUNKS_PATH = `${SDK_BUNDLE_PATH}/chunks`;
module.exports.SDK_BUNDLE_CHUNKS_PATH = SDK_BUNDLE_CHUNKS_PATH;

const SDK_BUNDLE_FILENAME = "embedding-sdk.js";
module.exports.SDK_BUNDLE_FILENAME = SDK_BUNDLE_FILENAME;

// Single URL used by the NPM package for all scenarios.
// The backend decides what to serve based on the packageVersion query param.
module.exports.SDK_BUNDLE_FULL_PATH = `app/${SDK_BUNDLE_FILENAME}`;

const SDK_BUNDLE_BOOTSTRAP_FILENAME = "embedding-sdk.js";
module.exports.SDK_BUNDLE_BOOTSTRAP_FILENAME = SDK_BUNDLE_BOOTSTRAP_FILENAME;

module.exports.SDK_BUNDLE_BOOTSTRAP_FULL_PATH = `${SDK_BUNDLE_CHUNKS_PATH}/${SDK_BUNDLE_BOOTSTRAP_FILENAME}`;
