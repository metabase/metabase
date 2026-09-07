import { builtinRules } from "eslint/use-at-your-own-risk";
import { jsRules } from "../config.mjs";
import { wrap } from "../plugin.mjs";
export default wrap("eslint-js", {
  rules: Object.fromEntries(
    jsRules["eslint-js"].map((name) => [name, builtinRules.get(name)]),
  ),
});
