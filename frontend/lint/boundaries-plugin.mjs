// oxlint jsPlugin that runs `eslint-plugin-boundaries` with the module graph
// baked in.
//
// eslint-plugin-boundaries reads the element graph from
// `settings["boundaries/elements"]` and the allow/disallow policy from each
// rule's options. Both come from `module-boundaries.mjs`. A JS plugin can
// import that module directly, so the graph never has to be inlined into a
// generated JSON config: this plugin injects it at runtime instead. That
// removes the `generate-oxlint-boundaries.mjs` step and the staleness it
// guarded against.
//
// meta.name is "boundaries" so the rule names stay `boundaries/element-types`
// and `boundaries/no-unknown-files`, identical to the upstream plugin.

import boundaries from "eslint-plugin-boundaries";

import { elements, enforcedRules } from "./module-boundaries.mjs";

const injectedSettings = {
  "boundaries/elements": elements,
  "boundaries/ignore": ["**/e2e/**", "test/**"],
};

const withGraph = (rule, options) => ({
  ...rule,
  create(context) {
    const patched = Object.create(context, {
      settings: { value: { ...context.settings, ...injectedSettings } },
      options: { value: options },
    });
    return rule.create(patched);
  },
});

export default {
  meta: { name: "boundaries" },
  rules: {
    "element-types": withGraph(boundaries.rules["element-types"], [
      { default: "disallow", rules: enforcedRules },
    ]),
    "no-unknown-files": withGraph(boundaries.rules["no-unknown-files"], []),
  },
};
