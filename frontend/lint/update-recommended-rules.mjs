import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { builtinRules } from "eslint/use-at-your-own-risk";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import configs from "../../eslint.config.mjs";
import ruleMap from "./oxlint/rule-map.json" with { type: "json" };

function stripConfig(config) {
  const copy = { ...config };
  delete copy.plugins;
  if (copy.languageOptions) {
    copy.languageOptions = { ...copy.languageOptions };
    delete copy.languageOptions.parser;
  }
  return copy;
}
const plugins = Object.assign({}, ...configs.map((config) => config.plugins));
export const recommendedRules = {
  javascript: js.configs.recommended.rules,
  react: plugins.react.configs.recommended.rules,
  jsxRuntime: plugins.react.configs["jsx-runtime"].rules,
  hooks: plugins["react-hooks"].configs.recommended.rules,
  i18next: plugins.i18next.configs["flat/recommended"].rules,
  typescript: tseslint.configs.recommended.map(stripConfig),
  jest: plugins.jest.configs.recommended.rules,
  jestDom: plugins["jest-dom"].configs.recommended.rules,
  testingLibrary: plugins["testing-library"].configs.react.rules,
  storybook: plugins.storybook.configs["flat/recommended"].map(stripConfig),
};
export const ruleDefaults = Object.fromEntries(
  Object.keys(ruleMap).flatMap((name) => {
    const slash = name.lastIndexOf("/");
    const rule =
      slash === -1
        ? builtinRules.get(name)
        : plugins[name.slice(0, slash)]?.rules[name.slice(slash + 1)];
    return rule?.meta.defaultOptions ? [[name, rule.meta.defaultOptions]] : [];
  }),
);
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  for (const [filename, value] of [
    ["./recommended-rules.json", recommendedRules],
    ["./oxlint/rule-defaults.json", ruleDefaults],
  ]) {
    fs.writeFileSync(
      new URL(filename, import.meta.url),
      JSON.stringify(value, null, 2) + "\n",
    );
  }
}
