const {
  SIDE_EFFECT_PATHS,
} = require("../build/shared/rspack/side-effect-free-modules.js");

// Options for metabase/no-module-side-effects, shared by eslint.config.mjs and the registry generator.
const NO_MODULE_SIDE_EFFECTS_OPTIONS = {
  sideEffectPaths: SIDE_EFFECT_PATHS,
  // Calls into these count as our own code, which we trust to only return a value.
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

// Files the rule never runs on, in eslint.config.mjs and in the registry generator alike.
const NO_MODULE_SIDE_EFFECTS_IGNORES = [
  "**/*.unit.spec.*",
  "**/*.stories.*",
  "**/tests/**",
  "**/__support__/**",
  "**/*.d.ts",
];

module.exports = {
  NO_MODULE_SIDE_EFFECTS_OPTIONS,
  NO_MODULE_SIDE_EFFECTS_IGNORES,
};
