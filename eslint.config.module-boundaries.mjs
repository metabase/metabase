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
  policies as boundaryPolicies,
} from "./frontend/lint/module-boundaries.mjs";
import { createSourceSpecificBoundaryConfigs } from "./frontend/lint/source-specific-boundaries.mjs";
import { canonicalizeBoundariesPlugin } from "./frontend/lint/canonicalize-boundaries-plugin.mjs";

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

const boundarySettings = {
  "boundaries/elements": boundaryElements,
  "boundaries/ignore": ["**/e2e/**", "test/**"],
  "boundaries/dependency-nodes": ["import", "dynamic-import"],
  "boundaries/legacy-templates": false,
  "boundaries/legacy-warnings": false,
};

// The boundaries plugin caches its matcher per merged-settings identity; the
// wrapper canonicalizes the (deep-equal) settings so it is built once despite
// the per-source configs. See canonicalize-boundaries-plugin.mjs.
const boundariesPlugin = canonicalizeBoundariesPlugin(boundaries);

// One flat config per element descriptor, holding only the policies whose
// `from` selector can match that element's type. See
// frontend/lint/source-specific-boundaries.mjs for details.
const sourceSpecificBoundaryConfigs = createSourceSpecificBoundaryConfigs({
  elements: boundaryElements,
  policies: boundaryPolicies,
  plugin: boundariesPlugin,
  settings: boundarySettings,
});

export default defineConfig([
  globalIgnores(["**/e2e/**", "test/**"]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    files: [
      "frontend/src/**/*.{ts,tsx}",
      "enterprise/frontend/src/**/*.{ts,tsx}",
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
      boundaries: boundariesPlugin,
      react,
    },
    settings: {
      ...boundarySettings,
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
      // Every file frontend/src/ and enterprise/frontend/src/ must belong to a declared module.
      "boundaries/no-unknown-files": "error",
    },
  },
  ...sourceSpecificBoundaryConfigs,
]);
