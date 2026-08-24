const {
  SIDE_EFFECT_PATHS,
} = require("../build/shared/rspack/side-effect-free-modules.js");

// The options eslint.config.mjs passes to `metabase/no-module-side-effects`.
// The registry generator (scripts/side-effect-files.js) lints with the same object.
const NO_MODULE_SIDE_EFFECTS_OPTIONS = {
  sideEffectPaths: SIDE_EFFECT_PATHS,
  // A module-scope call into one of these counts as our own code.
  internalModules: [
    "metabase",
    "metabase-lib",
    "metabase-types",
    "metabase-enterprise",
    "embedding-sdk-bundle",
    "embedding-sdk-shared",
    "embedding-sdk-package",
    "embedding",
    "custom-viz",
    "cljs",
    "__support__",
  ],
};

module.exports = { NO_MODULE_SIDE_EFFECTS_OPTIONS };
