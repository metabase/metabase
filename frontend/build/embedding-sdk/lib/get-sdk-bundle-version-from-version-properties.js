/* eslint-env node */

const fs = require("fs");
const path = require("path");

module.exports.getSdkBundleVersionFromVersionProperties = () => {
  const versionPropertiesContent = fs.readFileSync(
    path.resolve(
      path.join(__dirname, "../../../../", "resources/version.properties"),
    ),
    "utf-8",
  );

  if (!versionPropertiesContent) {
    throw new Error(`Failed to get App version from version.properties`);
  }

  return versionPropertiesContent.match(/^tag=(.+)$/m)?.[1] ?? "unknown";
};
