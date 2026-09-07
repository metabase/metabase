// Shared by the SDK bundle build and lint's import resolver.
const { resolve } = require("../../shared/rspack/resolve-config");
const { EXTERNAL_DEPENDENCIES } = require("../constants/external-dependencies");

module.exports = { resolve, externals: EXTERNAL_DEPENDENCIES };
