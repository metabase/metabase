const fs = require("fs");
const path = require("path");

const {
  EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION,
} = require("../constants/versions");

module.exports.getSdkPackageVersionFromPackageJson = () => {
  const sdkPackageTemplateJson = fs.readFileSync(
    path.resolve(
      path.join(
        __dirname,
        "../../../../",
        "enterprise/frontend/src/embedding-sdk-package/package.template.json",
      ),
    ),
    "utf-8",
  );

  if (!sdkPackageTemplateJson) {
    throw new Error(`Failed to get SDK package.template.json`);
  }

  return (
    JSON.parse(sdkPackageTemplateJson)?.version ||
    EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION
  );
};
