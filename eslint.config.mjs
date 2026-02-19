// @ts-check
import path from "path";
import { fileURLToPath } from "url";

import js from "@eslint/js";
import { fixupPluginRules } from "@eslint/compat";
import globals from "globals";
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

import metabasePlugin from "./frontend/lint/eslint-plugin-metabase/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shouldLintCssModules =
  process.env.LINT_CSS_MODULES === "true" || process.env.CI;

const TEST_FILES_NAME_PATTERN_ERROR_MESSAGE = `Please name your test setup and utils files with a ".spec.*" in the filename, or put them under "/tests", e.g. "setup.spec.ts", "MyComponent.setup.spec.ts", or "tests/setup.ts". This is to ensure they won't be imported in the SDK build.`;

const baseMetabaseRestrictedConfig = {
  patterns: [
    { group: ["metabase-enterprise"] },
    { group: ["metabase-enterprise/*"] },
    { group: ["cljs/metabase.lib*"] },
    { group: ["/embedding-sdk-package"] },
  ],
  paths: [
    {
      name: "react-redux",
      importNames: ["useSelector", "useDispatch", "connect"],
      message: "Please import from `metabase/lib/redux` instead.",
    },
    {
      name: "@mantine/core",
      message: "Please import from `metabase/ui` instead.",
    },
    {
      name: "@emotion/styled",
      message: "Please style components using css modules.",
    },
    {
      name: "@emotion/react",
      message:
        "Please use components from `metabase/ui` instead and style them using css modules.",
    },
    {
      name: "@storybook/test",
      message:
        "Please use `testing-library/react` or `@testing-library/user-event`",
    },
  ],
};

const configs = [
  {
    ignores: [
      "frontend/src/cljs/**",
      "frontend/src/cljs_release/**",
      "e2e/support/cypress_sample_database.js",
      "e2e/support/cypress_sample_instance_data.js",
      "e2e/embedding-sdk-host-apps/**",
      "frontend/src/metabase-types/openapi/types.gen.ts",
      "node_modules/**",
      "**/dist/**",
      "**/target/**",
      "resources/**",
      "**/__snapshots__/**",
      ".shadow-cljs/**",
      "!.storybook/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.commonjs,
        ...globals.jest,
        before: "readonly",
        cy: "readonly",
        Cypress: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
          legacyDecorators: true,
        },
      },
    },
    plugins: {
      metabase: metabasePlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      // Use 'import' namespace (not 'import-x') to maintain compatibility with existing eslint-disable comments
      import: importXPlugin,
      "no-only-tests": noOnlyTestsPlugin,
      ttag: fixupPluginRules(ttagPlugin),
      i18next: fixupPluginRules(i18nextPlugin),
      depend: fixupPluginRules(dependPlugin),
    },
    settings: {
      "import-x/internal-regex":
        "^metabase($|/)|^metabase-lib($|/)|^metabase-types($|/)|^metabase-enterprise($|/)|^embedding-sdk-bundle($|/)|^embedding-sdk-shared($|/)|^embedding-sdk-package($|/)|^e2e($|/)|^__support__($|/)|^assets/|^cljs/|^ee-plugins($|/)|^sdk-ee-plugins($|/)|^build-configs/",
      "import-x/resolver": {
        node: true,
        webpack: {
          config: path.resolve(__dirname, "./rspack.main.config.js"),
          typescript: true,
        },
      },
      // Also set import/resolver for eslint-module-utils (used by custom rules)
      "import/resolver": {
        node: true,
        webpack: {
          config: path.resolve(__dirname, "./rspack.main.config.js"),
          typescript: true,
        },
      },
      "import-x/ignore": ["\\.css$"],
      react: {
        version: "detect",
      },
    },
    rules: {
      // Base ESLint rules
      strict: ["error", "never"],
      "no-undef": "error",
      "no-var": "warn",
      "no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "none",
          varsIgnorePattern: "^_.+$",
          ignoreRestSiblings: true,
          caughtErrors: "none", // Maintain v7 behavior
        },
      ],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      curly: ["warn", "all"],
      eqeqeq: ["warn", "smart"],
      "prefer-const": ["warn", { destructuring: "all" }],
      "no-restricted-globals": ["error", "close"],
      "no-useless-escape": "off",
      complexity: ["error", { max: 55 }],
      "no-console": ["error", { allow: ["warn", "error", "errorBuffer"] }],

      // Import rules
      "import/export": "error",
      "import/no-duplicates": ["warn", { considerQueryString: true }],
      "import/no-default-export": "error",
      "import/no-named-as-default": "off",
      "import/no-commonjs": "warn",
      "import/order": [
        "error",
        {
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            orderImportKind: "asc",
            caseInsensitive: false,
          },
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
          ],
          warnOnUnassignedImports: false,
        },
      ],
      "sort-imports": [
        "error",
        {
          ignoreDeclarationSort: true,
        },
      ],

      // React rules
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      "react/no-is-mounted": "error",
      "react/prefer-es6-class": "error",
      "react/display-name": "warn",
      "react/prop-types": "error",
      "react/no-did-mount-set-state": "off",
      "react/no-did-update-set-state": "off",
      "react/no-find-dom-node": "off",
      "react/no-children-prop": "error",
      "react/no-string-refs": "error",
      "react/no-unescaped-entities": "error",
      "react/jsx-no-target-blank": "error",
      "react/jsx-key": "error",
      "react/forbid-component-props": ["error", { forbid: ["sx"] }],

      // React Hooks rules
      ...reactHooksPlugin.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",

      "no-only-tests/no-only-tests": [
        "error",
        {
          block: [
            "describe",
            "it",
            "context",
            "test",
            "tape",
            "fixture",
            "serial",
            "Feature",
            "Scenario",
            "Given",
            "And",
            "When",
            "Then",
          ],
        },
      ],

      // Custom metabase rules
      "metabase/jtag-missing-key": "error",
      "metabase/no-unconditional-metabase-links-render": "error",
      "metabase/no-color-literals": "error",
      "metabase/no-literal-metabase-strings": "error",
      "metabase/no-oss-reinitialize-import": "error",

      "depend/ban-dependencies": [
        "error",
        {
          allowed: [
            "underscore",
            "lodash.orderby",
            "lodash.debounce",
            "chalk",
            "node-fetch",
            "js-yaml",
            "glob",
            "ora",
            "cross-fetch",
          ],
        },
      ],

      ...i18nextPlugin.configs["flat/recommended"].rules,
    },
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: ["@babel/preset-react"],
        },
      },
    },
  },
  {
    files: [
      "**/*.unit.spec.*",
      "frontend/src/metabase/admin/**/*",
      "frontend/src/metabase/setup/**/*",
      "enterprise/frontend/src/metabase-enterprise/whitelabel/**/*",
      "enterprise/frontend/src/metabase-enterprise/embedding/**/*",
      "frontend/lint/**/*",
      "**/*.stories.*",
      "**/.storybook/*",
      "**/stories-data.*",
      "e2e/**/*",
      "**/tests/*",
      "release/**/*",
      "rspack.config.js",
      "rspack.main.config.js",
      "rspack.embedding-sdk-package.config.js",
      "rspack.embedding-sdk-bundle.config.js",
    ],
    rules: {
      "metabase/no-color-literals": "off",
      "metabase/no-unconditional-metabase-links-render": "off",
      "metabase/no-literal-metabase-strings": "off",
    },
  },
  {
    files: [
      "**/*.unit.spec.*",
      "frontend/lint/**/*",
      "**/*.stories.*",
      "**/stories-data.*",
      "e2e/**/*",
      "**/tests/*",
      "release/**/*",
      "rspack.main.config.js",
    ],
    rules: {
      "i18next/no-literal-string": "off",
    },
  },
  // ts configs
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "prefer-rest-params": "off",
      "react/prop-types": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_.+$",
          varsIgnorePattern: "^_.+$",
          ignoreRestSiblings: true,
          destructuredArrayIgnorePattern: "^_.+$",
          caughtErrors: "none",
        },
      ],
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "no-unused-vars": "off", // Disable base rule for TS files
    },
  },
  {
    files: [
      "**/*.unit.spec.ts",
      "**/*.unit.spec.tsx",
      "**/*.unit.spec.js",
      "**/*.unit.spec.jsx",
    ],
    plugins: {
      jest: jestPlugin,
      "jest-dom": jestDomPlugin,
      "testing-library": testingLibraryPlugin,
      // @ts-ignore
      "jest-formatting": fixupPluginRules(jestFormattingPlugin),
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      ...jestDomPlugin.configs.recommended.rules,
      ...testingLibraryPlugin.configs.react.rules,
      ...jestFormattingPlugin.configs.recommended.rules,
      "jest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
      "jest/expect-expect": [
        "error",
        {
          assertFunctionNames: ["expect*", "assert*"],
          additionalTestBlockFunctions: [],
        },
      ],
    },
  },

  // Jest formatting for cypress tests
  {
    files: ["**/*.cy.spec.ts", "**/*.cy.spec.js"],
    plugins: {
      // @ts-ignore
      "jest-formatting": fixupPluginRules(jestFormattingPlugin),
    },
    rules: {
      ...jestFormattingPlugin.configs.recommended.rules,
    },
  },
  {
    files: ["e2e/**/*"],
    languageOptions: {
      globals: {
        ...globals.node,
        cy: "readonly",
        Cypress: "readonly",
        context: "readonly",
        assert: "readonly", // Chai's assert, bundled with Cypress
      },
    },
    plugins: {
      cypress: cypressPlugin,
      "chai-friendly": chaiFriendlyPlugin,
    },
    rules: {
      "metabase/no-unscoped-text-selectors": "error",
      "import/no-commonjs": "off",
      "metabase/no-color-literals": "off",
      "no-console": "off",
      "@typescript-eslint/no-namespace": "off",
      "cypress/no-assigning-return-values": "error",
      "cypress/no-async-tests": "error",
      "cypress/no-pause": "error",
      // Use chai-friendly version to allow Chai assertions like expect(x).to.be.true
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "chai-friendly/no-unused-expressions": "error",
      quotes: ["error", "double", { avoidEscape: true }],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "metabase-types/api/mocks/presets",
              message: "Please use e2e/support/cypress_sample_database instead",
            },
          ],
          patterns: [
            {
              group: [
                "**/enterprise/frontend/src/embedding-sdk-package",
                "**/enterprise/frontend/src/embedding-sdk-package/*",
              ],
              message:
                "Please use SDK package name - '@metabase/embedding-sdk-react'",
            },
          ],
        },
      ],
      "import/no-unresolved": [
        "error",
        { ignore: ["@metabase/embedding-sdk-react"] },
      ],
      "metabase/no-direct-helper-import": "error",
      "metabase/no-unsafe-element-filtering": "warn",
      "metabase/no-unordered-test-helpers": "error",
    },
  },
  {
    files: ["e2e/**/*.cy.spec.*"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["frontend/test/**/*"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "import/no-commonjs": "off",
      "metabase/no-color-literals": "off",
    },
  },
  {
    files: ["release/**/*.ts", "release/**/*.js"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["frontend/src/metabase/**/*"],
    plugins: {
      ttag: fixupPluginRules(ttagPlugin),
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: baseMetabaseRestrictedConfig.paths,
          patterns: [
            ...baseMetabaseRestrictedConfig.patterns,
            {
              group: ["__support__/**", "!__support__/metadata"],
              message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
            },
          ],
        },
      ],
      "ttag/no-module-declaration": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/mb-base-color-/]",
          message:
            "You may not use base colors in the application, use semantic colors instead. (see colors.module.css)",
        },
      ],
    },
  },
  {
    files: ["frontend/src/metabase/app.js"],
    rules: {
      "import/no-duplicates": "off",
    },
  },
  {
    files: ["frontend/src/metabase/**/*.stories.tsx"],
    rules: {
      "import/no-default-export": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["frontend/src/metabase/lib/redux/hooks.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: [
      "frontend/src/metabase/**/*.spec.*",
      "frontend/src/metabase/**/test-utils.*",
      "frontend/src/metabase/**/tests/**/*",
      "frontend/src/metabase/**/test/**/*",
    ],
    rules: {
      "no-restricted-imports": ["error", baseMetabaseRestrictedConfig],
    },
  },
  {
    files: ["frontend/src/metabase/ui/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "metabase-enterprise",
            "metabase-enterprise/*",
            "cljs/metabase.lib*",
          ],
          paths: [
            {
              name: "@emotion/styled",
              message: "Please style components using css modules.",
            },
            {
              name: "@emotion/react",
              message:
                "Please use components from `metabase/ui` instead and style them using css modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["frontend/src/metabase/metadata/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "metabase-enterprise",
            "metabase-enterprise/*",
            "cljs/metabase.lib*",
            "/embedding-sdk-package",
            "/embedding-sdk-bundle",
            "/embedding-sdk-shared",
            "metabase/entities",
            "metabase/entities/*",
          ],
          paths: [
            {
              name: "react-redux",
              importNames: ["useSelector", "useDispatch", "connect"],
              message: "Please import from `metabase/lib/redux` instead.",
            },
            {
              name: "@mantine/core",
              message: "Please import from `metabase/ui` instead.",
            },
            {
              name: "@emotion/styled",
              message: "Please style components using css modules.",
            },
            {
              name: "@emotion/react",
              message:
                "Please use components from `metabase/ui` instead and style them using css modules.",
            },
            {
              name: "@storybook/test",
              message:
                "Please use `testing-library/react` or `@testing-library/user-event`",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["frontend/src/metabase-lib/**/*"],
    plugins: {
      ttag: fixupPluginRules(ttagPlugin),
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "metabase/*",
                "!metabase/env",
                "!metabase/lib",
                "!metabase/querying",
                "!metabase/services",
              ],
            },
            {
              group: [
                "metabase/lib/*",
                "!metabase/lib/colors",
                "!metabase/lib/encoding",
                "!metabase/lib/formatting",
                "!metabase/lib/number",
                "!metabase/lib/time",
                "!metabase/lib/time-dayjs",
                "!metabase/lib/types",
                "!metabase/lib/urls",
                "!metabase/lib/utils",
              ],
            },
          ],
        },
      ],
      "ttag/no-module-declaration": "error",
    },
  },
  {
    files: ["frontend/src/embedding-sdk-bundle/**/*"],
    plugins: {
      ttag: fixupPluginRules(ttagPlugin),
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: baseMetabaseRestrictedConfig.paths,
          patterns: [
            ...baseMetabaseRestrictedConfig.patterns,
            {
              group: ["__support__/**", "!__support__/metadata"],
              message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
            },
            {
              group: ["metabase/common/components/LogoIcon"],
              importNames: ["LogoIcon"],
              message:
                "Do not use LogoIcon in the SDK. With custom Icon, it doesn't work because it uses the Metabase instance's relative path.",
            },
          ],
        },
      ],
      "ttag/no-module-declaration": "error",
    },
  },
  {
    files: [
      "frontend/src/embedding-sdk-bundle/**/*.spec.*",
      "frontend/src/embedding-sdk-bundle/**/test-utils.*",
      "frontend/src/embedding-sdk-bundle/**/tests/**/*",
      "frontend/src/embedding-sdk-bundle/**/test/**/*",
    ],
    rules: {
      "no-restricted-imports": ["error", baseMetabaseRestrictedConfig],
    },
  },
  {
    files: ["frontend/src/embedding-sdk-bundle/test/**/*"],
    rules: {
      "metabase/no-color-literals": "off",
    },
  },
  {
    files: ["frontend/src/embedding-sdk-shared/**/*"],
    plugins: {
      ttag: fixupPluginRules(ttagPlugin),
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: baseMetabaseRestrictedConfig.paths,
          patterns: [
            ...baseMetabaseRestrictedConfig.patterns,
            {
              group: ["__support__/**", "!__support__/metadata"],
              message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
            },
          ],
        },
      ],
      "ttag/no-module-declaration": "error",
    },
  },
  {
    files: ["frontend/src/metabase/query_builder/**/*"],
    rules: {
      "import/no-cycle": "error",
    },
  },
  {
    files: ["enterprise/frontend/src/**/*"],
    plugins: {
      ttag: fixupPluginRules(ttagPlugin),
    },
    settings: {
      "import-x/resolver": {
        node: true,
        webpack: {
          config: path.resolve(
            __dirname,
            "./rspack.embedding-sdk-bundle.config.js",
          ),
          typescript: true,
        },
      },
      // Also set import/resolver for eslint-module-utils (used by custom rules)
      "import/resolver": {
        node: true,
        webpack: {
          config: path.resolve(
            __dirname,
            "./rspack.embedding-sdk-bundle.config.js",
          ),
          typescript: true,
        },
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["cljs/metabase.lib*"] },
            {
              group: ["__support__/**", "!__support__/metadata"],
              message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
            },
          ],
          paths: [
            {
              name: "@mantine/core",
              message: "Please import from `metabase/ui` instead.",
            },
            {
              name: "@storybook/test",
              message:
                "Please use `testing-library/react` or `@testing-library/user-event`",
            },
            {
              name: "react-redux",
              importNames: ["useSelector", "useDispatch", "connect"],
              message: 'Please use "useSdkSelector", "useSdkDispatch"',
            },
          ],
        },
      ],
      "ttag/no-module-declaration": "error",
    },
  },
  {
    files: [
      "enterprise/frontend/src/embedding-sdk-{package,bundle,shared}/**/*",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["cljs/metabase.lib*"] },
            {
              group: ["__support__/**"],
              message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
            },
          ],
          paths: [
            {
              name: "@mantine/core",
              message: "Please import from `metabase/ui` instead.",
            },
            {
              name: "@storybook/test",
              message:
                "Please use `testing-library/react` or `@testing-library/user-event`",
            },
            {
              name: "react-redux",
              importNames: ["useSelector", "useDispatch", "connect"],
              message: 'Please use "useSdkSelector", "useSdkDispatch"',
            },
            {
              name: "metabase/lib/redux",
              importNames: ["useStore", "useDispatch"],
              message: 'Please use "useSdkStore", "useSdkDispatch"',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "enterprise/frontend/src/**/*.spec.*",
      "enterprise/frontend/src/**/test-utils.*",
      "enterprise/frontend/src/**/tests/**/*",
      "enterprise/frontend/src/**/test/**/*",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{ group: ["cljs/metabase.lib*"] }],
          paths: [
            {
              name: "@mantine/core",
              message: "Please import from `metabase/ui` instead.",
            },
            {
              name: "@storybook/test",
              message:
                "Please use `testing-library/react` or `@testing-library/user-event`",
            },
            {
              name: "react-redux",
              importNames: ["useSelector", "useDispatch", "connect"],
              message: 'Please use "useSdkSelector", "useSdkDispatch"',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "enterprise/frontend/src/**/.storybook/*",
      "enterprise/frontend/src/**/*.stories.tsx",
    ],
    rules: {
      "import/no-default-export": "off",
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["enterprise/frontend/src/embedding-sdk-{package,shared}/**/*"],
    ignores: [
      "enterprise/frontend/src/embedding-sdk-package/{bin,cli}/**/*",
      "**/.storybook/**",
      "**/jest/**",
      "**/test/**",
      "**/*.spec.{ts,tsx,js,jsx}",
      "**/*.stories.{ts,tsx,js,jsx}",
    ],
    rules: {
      "metabase/no-external-references-for-sdk-package-code": [
        "error",
        {
          allowedPaths: [
            path.join(
              __dirname,
              "enterprise/frontend/src/embedding-sdk-package",
            ),
            path.resolve(__dirname, "frontend/src/embedding-sdk-shared"),
          ],
        },
      ],
    },
  },
  {
    files: ["enterprise/frontend/src/embedding/auth-common/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "embedding-sdk-bundle/*",
                "metabase/*",
                "!embedding-sdk-bundle/errors",
                "!embedding-sdk-bundle/types",
              ],
              message:
                "Keep imports in auth-common to a minimum as it is used in embed.js for iframe embedding.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["enterprise/frontend/src/embedding-sdk-package/bin/**/*"],
    rules: {
      "metabase/no-literal-metabase-strings": "off",
      "no-console": "off",
    },
  },
  {
    files: ["enterprise/frontend/src/embedding-sdk-package/cli/**/*"],
    rules: {
      "metabase/no-literal-metabase-strings": "off",
      "metabase/no-color-literals": "off",
      "no-console": "off",
    },
  },
  {
    files: ["docs/**/snippets/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-var-requires": "off",
      "import/no-commonjs": "off",
      "import/no-default-export": "off",
      "import/order": "off",
      "import/no-unresolved": "off",
      "metabase/no-color-literals": "off",
    },
  },
  {
    files: ["frontend/build/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "import/no-commonjs": "off",
    },
  },
  {
    files: ["frontend/lint/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "import/no-commonjs": "off",
    },
  },
  {
    files: ["**/*.stories.tsx", "**/preview.tsx"],
    rules: {
      "import/no-default-export": "off",
    },
  },
  {
    files: [
      "*.config.js",
      "*.config.mjs",
      "rspack.*.js",
      "bin/**/*.js",
      ".github/scripts/**/*.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "import/no-commonjs": "off",
      "no-console": "off",
    },
  },

  // ============================================
  // STORYBOOK (uses native flat config from v9)
  // ============================================
  ...storybookPlugin.configs["flat/recommended"],
  {
    files: ["**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)"],
    rules: {
      // Disable new v9 rule - fixing this is out of scope for eslint upgrade
      "storybook/no-renderer-packages": "off",
    },
  },
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
