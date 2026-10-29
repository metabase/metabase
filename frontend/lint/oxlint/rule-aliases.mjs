import ruleMap from "./rule-map.json" with { type: "json" };

// Oxlint reserves native namespaces, so retained JS rules need distinct suppression names.
export const ruleAliases = Object.fromEntries(
  Object.entries(ruleMap).filter(([, target]) =>
    /^(?:eslint|import|react|jest|typescript)-js\//.test(target),
  ),
);
export function aliasRules(rules = {}) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, value]) => [
      ruleAliases[name] ?? name,
      value,
    ]),
  );
}
