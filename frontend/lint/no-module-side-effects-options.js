const {
  SIDE_EFFECT_PATHS,
} = require("../build/shared/rspack/side-effect-free-modules.js");

// The options eslint.config.mjs passes to `metabase/no-module-side-effects`.
// The registry generator (scripts/side-effect-files.js) lints with the same object,
// so frontend/lint/side-effect-files.json lists a file exactly when the rule as configured reports it.
const NO_MODULE_SIDE_EFFECTS_OPTIONS = {
  sideEffectPaths: SIDE_EFFECT_PATHS,
  // Alias roots that resolve inside the repo (the tsconfig `paths` roots).
  // A module-scope call into one of them counts as our own code.
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
