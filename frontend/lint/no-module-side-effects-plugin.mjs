// oxlint jsPlugin that runs `metabase/no-module-side-effects` with its options
// injected.
//
// The rule's `sideEffectPaths` option is a list of absolute paths (the
// exception files that legitimately run work at import). eslint.config.mjs
// builds them from REPO_ROOT; a JSON config cannot. So, like the boundaries
// wrapper, this imports the shared options object and injects it at runtime.
// Importing it live also keeps the option list from drifting.

import rule from "./eslint-plugin-metabase/rules/no-module-side-effects.js";
import options from "./no-module-side-effects-options.js";

const injected = [options.NO_MODULE_SIDE_EFFECTS_OPTIONS];

export default {
  meta: { name: "metabase-side-effects" },
  rules: {
    "no-module-side-effects": {
      ...rule,
      create(context) {
        const patched = Object.create(context, {
          options: { value: injected },
        });
        return rule.create(patched);
      },
    },
  },
};
