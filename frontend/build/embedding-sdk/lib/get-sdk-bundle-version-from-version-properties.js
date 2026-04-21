const fs = require("fs");
const path = require("path");

const {
  EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION,
} = require("../constants/versions");

module.exports.getSdkBundleVersionFromVersionProperties = () => {
  try {
    const versionPropertiesContent = fs.readFileSync(
      path.resolve(
        path.join(__dirname, "../../../../", "resources/version.properties"),
      ),
      "utf-8",
    );

    return (
      versionPropertiesContent.match(/^tag=(.+)$/m)?.[1] ??
      EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION
    );
  } catch {
    console.error(`Failed to get App version from version.properties`);

    return EMBEDDING_SDK_BUNDLE_UNKNOWN_VERSION;
  }
};
