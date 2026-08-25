// Generates per-source ESLint flat configs for `boundaries/dependencies`.
//
// Instead of one rule instance holding every policy (each dependency then
// scans all policies, most of which cannot match the importing file), each
// element descriptor gets its own config entry restricted to the policies
// whose `from` selector can match that element's type. The `from` selectors
// are dropped from the surviving policies because the config's `files` glob
// already guarantees the source element type, so the rule never re-checks it.
// This cuts the policies evaluated per dependency from ~187 to ~3 without
// changing matching semantics: policies whose `from` could not match the
// source could never match that dependency anyway, and within a source the
// policy order (last match wins) is preserved.
//
// The descriptor patterns double as ESLint `files` globs. Ordering rules:
// - Flat configs are applied in array order and the last matching config's
//   rule wins, so subset patterns (declared first in the elements list, where
//   first match wins) must be emitted last => reversed order.
// - `mode: "full"` descriptors describe single files nested inside folder
//   patterns of other elements; the plugin classifies those at the deepest
//   path level, so their configs must come after every folder config.

import micromatch from "micromatch";

// A selector we can statically match against a source type: `{ element: { type } }`
// with no other constraints (no captured values, file/module selectors, etc.).
const isTypeOnlyEntitySelector = (selector) =>
  typeof selector?.element?.type === "string" &&
  Object.keys(selector).length === 1 &&
  Object.keys(selector.element).length === 1;

const policyMatchesSourceType = (policy, sourceType) =>
  policy.from.some((selector) =>
    micromatch.isMatch(sourceType, selector.element.type),
  );

// Keeps only policies that can apply to `sourceType`, dropping their `from`
// selectors. Policies without `from` apply to every source; policies with
// selectors this helper does not understand are preserved verbatim so the
// fallback path keeps the original semantics.
const specializePolicies = (policies, sourceType) =>
  policies.flatMap(({ from, ...policy }) => {
    if (!from) {
      return [policy];
    }
    if (!from.every(isTypeOnlyEntitySelector)) {
      return [{ ...policy, from }];
    }
    return policyMatchesSourceType({ from }, sourceType) ? [policy] : [];
  });

const dependenciesRule = (policies, message) => [
  "error",
  {
    default: "disallow",
    policies,
    ...(message && { message }),
  },
];

const createSourceConfig = (element, options) => {
  const { plugin, settings, message } = options;
  return {
    files: Array.isArray(element.pattern) ? element.pattern : [element.pattern],
    plugins: { boundaries: plugin },
    settings,
    rules: {
      "boundaries/dependencies": dependenciesRule(
        specializePolicies(options.policies, element.type),
        message,
      ),
    },
  };
};

export function createSourceSpecificBoundaryConfigs({
  elements,
  policies,
  plugin,
  settings,
  message,
}) {
  const options = { policies, plugin, settings, message };
  const folderElements = elements
    .filter(({ mode }) => mode !== "full")
    .toReversed();
  const fullElements = elements
    .filter(({ mode }) => mode === "full")
    .toReversed();
  return [...folderElements, ...fullElements].map((element) =>
    createSourceConfig(element, options),
  );
}
