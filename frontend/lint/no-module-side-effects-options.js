const {
  SIDE_EFFECT_PATHS,
} = require("../build/shared/rspack/side-effect-free-modules.js");

// The options `metabase/no-module-side-effects` runs with in eslint.config.mjs.
// The registry scan (scripts/side-effect-files.js) uses the same object, so a file is in
// frontend/lint/side-effect-files.json exactly when the configured rule reports it.
const NO_MODULE_SIDE_EFFECTS_OPTIONS = {
  sideEffectPaths: SIDE_EFFECT_PATHS,
  // Alias roots that resolve inside the repo (the tsconfig `paths` roots),
  // so a module-scope call into them counts as our own code
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
