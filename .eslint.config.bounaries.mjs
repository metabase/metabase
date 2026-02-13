// temporary eslint file to be able to run only module boundaries linting

// to run: bunx eslint --config .eslint.config.bounaries.mjs "frontend/src/metabase/**/*.{js,jsx,ts,tsx}"

import boundaries from "eslint-plugin-boundaries";
import react from "eslint-plugin-react";
import tseslint from 'typescript-eslint';
import { globalIgnores, defineConfig } from "eslint/config";

const { elements: boundaryElements, rules: boundaryRules } = await import("./frontend/src/.boundaries.js");

// dummy plugins to keep eslint from complaining about missing plugins and settings

const alwaysPassingRule= {
  meta: {
    type: "problem",
    docs: {
      description: "stub for ttag/no-module-declaration - always passes",
    },
    schema: [], // no options
  },

  create(context) {
    // Return an empty visitor object - this rule does nothing and always passes
    return {};
  },
};

const alwaysPassingPlugin = {
  rules: {
    "no-module-declaration": alwaysPassingRule,
    "no-default-export": alwaysPassingRule,
    "no-color-literals": alwaysPassingRule,
    "order": alwaysPassingRule,
    "rules-of-hooks": alwaysPassingRule,
    "no-unconditional-metabase-links-render": alwaysPassingRule,
    "no-literal-string": alwaysPassingRule,
    "no-literal-metabase-strings": alwaysPassingRule,
    "no-require-imports": alwaysPassingRule,
    "exhaustive-deps": alwaysPassingRule,
    'no-unused-vars': alwaysPassingRule,
    'ban-ts-comment': alwaysPassingRule,
  },
};

export default defineConfig([
  globalIgnores(["**/*.unit.spec.*", "**/e2e/**", "*.stories.*", "test/**"]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off"
    },
    files: ["frontend/src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true // Enable JSX support
        },
      }
    },
    plugins: {
      ttag: alwaysPassingPlugin,
      metabase: alwaysPassingPlugin,
      import: alwaysPassingPlugin,
      i18next: alwaysPassingPlugin,
      'react-hooks': alwaysPassingPlugin,
      '@typescript-eslint': alwaysPassingPlugin,
      boundaries,
      react,
    },
    settings: {
      "boundaries/elements": boundaryElements,
      "boundaries/ignore": ["**/*.unit.spec.*", "**/e2e/**", "*.stories.*", "test/**"],
    },
    rules: {
      "boundaries/element-types": ["error", {
          default: "allow",
          rules: boundaryRules,
        }],
    },
  }
]);


