import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { builtinRules } from "eslint/use-at-your-own-risk";
import configs from "../../eslint.config.mjs";
import ruleMap from "./oxlint/rule-map.json" with { type: "json" };
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import * as reactHooksPlugin from "eslint-plugin-react-hooks";
import jestPlugin from "eslint-plugin-jest";
import jestDomPlugin from "eslint-plugin-jest-dom";
import testingLibraryPlugin from "eslint-plugin-testing-library";
import storybookPlugin from "eslint-plugin-storybook";
import i18nextPlugin from "eslint-plugin-i18next";

function stripConfig(config) {
  const copy = { ...config };
  delete copy.plugins;
  if (copy.languageOptions) {
    copy.languageOptions = { ...copy.languageOptions };
    delete copy.languageOptions.parser;
  }
  return copy;
}
export const recommendedRules = {
  javascript: js.configs.recommended.rules,
  react: reactPlugin.configs.recommended.rules,
  jsxRuntime: reactPlugin.configs["jsx-runtime"].rules,
  hooks: reactHooksPlugin.configs.recommended.rules,
  i18next: i18nextPlugin.configs["flat/recommended"].rules,
  typescript: tseslint.configs.recommended.map(stripConfig),
  jest: jestPlugin.configs.recommended.rules,
  jestDom: jestDomPlugin.configs.recommended.rules,
  testingLibrary: testingLibraryPlugin.configs.react.rules,
  storybook: storybookPlugin.configs["flat/recommended"].map(stripConfig),
};
const plugins = Object.assign({}, ...configs.map((config) => config.plugins));
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
