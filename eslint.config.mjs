// @ts-check
import { builtinRules } from "eslint/use-at-your-own-risk";
import { aliasRules } from "./frontend/lint/oxlint/rule-aliases.mjs";

import { fixupPluginRules } from "@eslint/compat";
import tseslint from "typescript-eslint";
import * as babelParser from "@babel/eslint-parser";
import reactPlugin from "eslint-plugin-react";
import * as reactHooksPlugin from "eslint-plugin-react-hooks";
import importXPlugin from "eslint-plugin-import-x";
import jestPlugin from "eslint-plugin-jest";
import jestDomPlugin from "eslint-plugin-jest-dom";
import * as jestFormattingPlugin from "eslint-plugin-jest-formatting";
import testingLibraryPlugin from "eslint-plugin-testing-library";
import cypressPlugin from "eslint-plugin-cypress";
import chaiFriendlyPlugin from "eslint-plugin-chai-friendly";
import noOnlyTestsPlugin from "eslint-plugin-no-only-tests";
import * as dependPlugin from "eslint-plugin-depend";
import storybookPlugin from "eslint-plugin-storybook";
import i18nextPlugin from "eslint-plugin-i18next";
import ttagPlugin from "eslint-plugin-ttag";

import boundaries from "eslint-plugin-boundaries";

import metabasePlugin from "./frontend/lint/eslint-plugin-metabase/index.js";
import policy from "./frontend/lint/config.mjs";

const shouldLintCssModules =
  process.env.LINT_CSS_MODULES === "true" || process.env.CI;
const configs = [
  {
    plugins: {
      metabase: metabasePlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      import: importXPlugin,
      "no-only-tests": noOnlyTestsPlugin,
      ttag: fixupPluginRules(ttagPlugin),
      i18next: i18nextPlugin,
      depend: fixupPluginRules(dependPlugin),
      boundaries,
      jest: jestPlugin,
      "jest-dom": jestDomPlugin,
      "testing-library": testingLibraryPlugin,
      "jest-formatting": fixupPluginRules(jestFormattingPlugin),
      cypress: cypressPlugin,
      "chai-friendly": chaiFriendlyPlugin,
      "@typescript-eslint": tseslint.plugin,
      storybook: storybookPlugin,
      "eslint-js": { rules: Object.fromEntries(builtinRules) },
      "import-js": importXPlugin,
      "react-js": reactPlugin,
      "jest-js": jestPlugin,
      "typescript-js": tseslint.plugin,
    },
  },
  { files: ["**/*.js", "**/*.jsx"], languageOptions: { parser: babelParser } },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser },
  },
  ...policy.map((entry) => ({
    ...entry,
    ...(entry.rules && { rules: aliasRules(entry.rules) }),
  })),
];
if (shouldLintCssModules) {
  try {
    const postcssModulesPlugin =
      // @ts-expect-error - optional plugin, may not be installed
      await import("eslint-plugin-postcss-modules");
    /** @type {any} */
    const postcssConfig = {
      files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
      plugins: {
        "postcss-modules": fixupPluginRules(postcssModulesPlugin.default),
      },
      settings: {
        "postcss-modules": {
          baseDir: "./frontend/src",
        },
      },
      rules: {
        "postcss-modules/no-undef-class": "error",
      },
    };
    configs.push(postcssConfig);
  } catch {
    // eslint-plugin-postcss-modules not installed
  }
}

export default configs;
