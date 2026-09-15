const { ENTERPRISE_SRC_PATH } = require("../../shared/rspack/resolve-aliases");
const { resolve } = require("../../shared/rspack/resolve-config");
const { EXTERNAL_DEPENDENCIES } = require("../constants/external-dependencies");

module.exports = {
  resolve: {
    ...resolve,
    // The SDK bundle ships the enterprise implementations in every edition.
    alias: {
      ...resolve.alias,
      "sdk-ee-plugins": ENTERPRISE_SRC_PATH + "/sdk-plugins",
      "sdk-iframe-embedding-ee-plugins":
        ENTERPRISE_SRC_PATH + "/sdk-iframe-embedding-plugins",
      "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",
    },
  },
  externals: EXTERNAL_DEPENDENCIES,
};
