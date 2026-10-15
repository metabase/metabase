import { builtinRules } from "eslint/use-at-your-own-risk";
import { jsRules } from "../config.mjs";
import { moduleScopeContext } from "../module-scope.mjs";
import { wrap } from "../plugin.mjs";
export default wrap("eslint-js", {
  rules: Object.fromEntries(
    jsRules["eslint-js"].map((name) => {
      const rule = builtinRules.get(name);
      return [
        name,
        name === "no-redeclare"
          ? {
              ...rule,
              create: (context) => rule.create(moduleScopeContext(context)),
            }
          : rule,
      ];
    }),
  ),
});
