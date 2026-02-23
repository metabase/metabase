const mainConfig = require("../../../../rspack.main.config");
const { IS_DEV_MODE } = require("../../shared/constants");

module.exports.OPTIMIZATION_CONFIG = {
  // The default `moduleIds: 'named'` setting breaks Cypress tests when `development` mode is enabled,
  // so we use a different value instead
  moduleIds: IS_DEV_MODE ? "natural" : undefined,

  minimize: !IS_DEV_MODE,
  minimizer: mainConfig.optimization.minimizer,

  // splitChunks is false — the chunked entries use `dependOn` for module dedup instead
  splitChunks: false,

  // Scope hoisting: merges ES modules into fewer closures, reducing parse overhead
  concatenateModules: true,

  // Avoid wrapping entry points in an IIFE — removes unnecessary function wrapper
  avoidEntryIife: true,
};
