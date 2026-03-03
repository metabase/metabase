/* eslint-env node */
/* eslint-disable import/no-commonjs */

// Lightweight resolve-only config for ESLint's webpack resolver.
// The full rspack.embedding-sdk-bundle.config.js loads postcss.config.js
// which requires ESM-only postcss-nesting@14, breaking in Electron's Node.js.
const mainConfig = require("./rspack.main.config");

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const SDK_BUNDLE_SRC_PATH =
  __dirname + "/frontend/src/embedding-sdk-bundle";

module.exports = {
  resolve: {
    ...mainConfig.resolve,
    alias: {
      ...mainConfig.resolve.alias,
      "sdk-ee-plugins": ENTERPRISE_SRC_PATH + "/sdk-plugins",
      "sdk-iframe-embedding-ee-plugins":
        ENTERPRISE_SRC_PATH + "/sdk-iframe-embedding-plugins",
      "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",
      "sdk-specific-imports":
        SDK_BUNDLE_SRC_PATH + "/lib/sdk-specific-imports.ts",
    },
  },
};
