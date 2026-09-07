import ruleMap from "./rule-map.json" with { type: "json" };

// Native namespaces are reserved by oxlint. Use the same names for retained JS
// rules in both engines so a suppression continues to target the same check.
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
