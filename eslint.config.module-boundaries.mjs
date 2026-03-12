// Standalone eslint config for running only module boundary linting.
//
// Usage: bunx eslint --config eslint.config.module-boundaries.mjs "frontend/src/**/*.{js,jsx,ts,tsx}" "enterprise/frontend/src/**/*.{js,jsx,ts,tsx}"

import path from "path";
import { fileURLToPath } from "url";
import boundaries from "eslint-plugin-boundaries";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import { globalIgnores, defineConfig } from "eslint/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { elements as boundaryElements, rules as boundaryRules } from "./frontend/lint/module-boundaries.mjs";

// dummy plugins to keep eslint from complaining about missing plugins and settings
const alwaysPassingRule = {
  meta: {
    type: "problem",
    docs: {
      description: "stub for ttag/no-module-declaration - always passes",
    },
    schema: [],
  },

  create() {
    // Return an empty visitor object - this rule does nothing and always passes
    return {};
  },
};

const alwaysPassingPlugin = {
  rules: {
    "no-module-declaration": alwaysPassingRule,
    "no-default-export": alwaysPassingRule,
    "no-color-literals": alwaysPassingRule,
    order: alwaysPassingRule,
    "rules-of-hooks": alwaysPassingRule,
    "no-unconditional-metabase-links-render": alwaysPassingRule,
    "no-literal-string": alwaysPassingRule,
    "no-literal-metabase-strings": alwaysPassingRule,
    "no-require-imports": alwaysPassingRule,
    "no-external-references-for-sdk-package-code": alwaysPassingRule,
    "exhaustive-deps": alwaysPassingRule,
    "no-unused-vars": alwaysPassingRule,
    "no-unused-expressions": alwaysPassingRule,
    "ban-ts-comment": alwaysPassingRule,
    "no-empty-object-type": alwaysPassingRule,
    "no-commonjs": alwaysPassingRule,
    "consistent-type-imports": alwaysPassingRule,
  },
};

export default defineConfig([
  globalIgnores(["**/*.unit.spec.*", "**/e2e/**", "*.stories.*", "test/**"]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    files: [
      "frontend/src/**/*.{js,jsx,ts,tsx}",
      "enterprise/frontend/src/**/*.{js,jsx,ts,tsx}",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      ttag: alwaysPassingPlugin,
      metabase: alwaysPassingPlugin,
      import: alwaysPassingPlugin,
      i18next: alwaysPassingPlugin,
      "react-hooks": alwaysPassingPlugin,
      "@typescript-eslint": alwaysPassingPlugin,
      boundaries,
      react,
    },
    settings: {
      "boundaries/elements": boundaryElements,
      "boundaries/ignore": [
        "**/*.unit.spec.*",
        "**/e2e/**",
        "*.stories.*",
        "test/**",
      ],
      "import-x/resolver": {
        node: true,
        webpack: {
          config: path.resolve(__dirname, "./rspack.main.config.js"),
          typescript: true,
        },
      },
      "import/resolver": {
        node: true,
        webpack: {
          config: path.resolve(__dirname, "./rspack.main.config.js"),
          typescript: true,
        },
      },
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: boundaryRules,
        },
      ],
    },
  },
]);
