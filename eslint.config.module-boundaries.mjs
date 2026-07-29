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

import {
  elements as boundaryElements,
  rules as boundaryRules,
} from "./frontend/lint/module-boundaries.mjs";

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

// Resolve any rule name to the always-passing stub, so eslint-disable
// directives don't error with "Definition for rule ... was not found".
const alwaysPassingPlugin = {
  rules: new Proxy(
    {},
    {
      get: () => alwaysPassingRule,
      has: () => true,
    },
  ),
};

export default defineConfig([
  globalIgnores(["**/e2e/**", "test/**"]),
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
      "testing-library": alwaysPassingPlugin,
      jest: alwaysPassingPlugin,
      "jest-dom": alwaysPassingPlugin,
      boundaries,
      react,
    },
    settings: {
      "boundaries/elements": boundaryElements,
      "boundaries/ignore": ["**/e2e/**", "test/**"],
      // Uncomment to also enforce boundary rules on TypeScript type-only
      // imports (`import type { ... } from "..."`). Off by default since the
      // plugin ignores type imports — they're erased at compile time and
      // create no runtime coupling — but turning this on catches conceptual
      // coupling (e.g. mlv1 importing types from custom-viz). Expect a
      // backlog of newly-surfaced violations on first run.
      // "boundaries/additional-dependency-nodes": [
      //   {
      //     selector: "ImportDeclaration[importKind=type] > Literal",
      //     name: "type-import",
      //     kind: "type",
      //   },
      // ],
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
      // Every file frontend/src/ and enterprise/frontend/src/ must belong to a declared module.
      "boundaries/no-unknown-files": "error",
    },
  },
]);
