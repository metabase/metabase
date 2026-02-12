/* eslint-disable import/no-commonjs */
/* eslint-disable no-undef */
const path = require("path");

const { elements: boundaryElements, rules: boundaryRules } = require("./frontend/src/.boundaries.js");
// `postcss-modules` lints css modules class names, but it currently crashes
// eslint on vscode. If you use webstorm or want to run the lint for the cli, you
// can use this flag to enable it. This is set to true in CI
const shouldLintCssModules =
  process.env.LINT_CSS_MODULES === "true" || process.env.CI;
const plugins = ["react", "no-only-tests", "ttag", "i18next", "boundaries"];
if (shouldLintCssModules) {
  plugins.push("postcss-modules");
}

module.exports = {
  ignorePatterns: ["!.storybook"],
  rules: {
    "boundaries/element-types": ["error", {
      default: "disallow",
      rules: boundaryRules,
    }],
    strict: [2, "never"],
    "no-undef": 2,
    "no-var": 1,
    "no-unused-vars": [
      "error",
      {
        vars: "all",
        args: "none",
        varsIgnorePattern: "^_.+$",
        ignoreRestSiblings: true,
      },
    ],
    "no-empty": [1, { allowEmptyCatch: true }],
    // Note: adding this rule to a eslint config file in a subfolder will remove
    // *not* carry over the restricted imports from parent folders, you will
    // need to copy them over
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "moment",
            message: "Moment is deprecated, please use dayjs",
          },
          {
            name: "moment-timezone",
            message: "Moment is deprecated, please use dayjs",
          },
        ],
      },
    ],
    curly: [1, "all"],
    eqeqeq: [1, "smart"],
    "import/no-duplicates": ["warn", { considerQueryString: true }],
    "import/no-default-export": 2,
    "import/no-named-as-default": 0,
    "import/no-commonjs": 1,
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
        // allows this rule to work with import/order
        ignoreDeclarationSort: true,
      },
    ],
    "no-console": [2, { allow: ["warn", "error", "errorBuffer"] }],
    "react/no-is-mounted": 2,
    "react/prefer-es6-class": 2,
    "react/display-name": 1,
    "react/prop-types": 2,
    "react/no-did-mount-set-state": 0,
    "react/no-did-update-set-state": 0,
    "react/no-find-dom-node": 0,
    "react/no-children-prop": 2,
    "react/no-string-refs": 2,
    "react/no-unescaped-entities": 2,
    "react/jsx-no-target-blank": 2,
    "react/jsx-key": 2,
    "react/forbid-component-props": [2, { forbid: ["sx"] }],
    "react-hooks/exhaustive-deps": ["warn"],
    "prefer-const": [1, { destructuring: "all" }],
    "no-restricted-globals": ["error", "close"],
    "no-useless-escape": 0,
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
    complexity: ["error", { max: 55 }],
    ...(shouldLintCssModules
      ? {
          "postcss-modules/no-undef-class": "error",
        }
      : {}),
  },
  globals: {
    before: true,
    cy: true,
    Cypress: true,
  },
  env: {
    browser: true,
    es2020: true,
    commonjs: true,
    jest: true,
    "jest/globals": true,
  },
  parser: "babel-eslint",
  plugins,
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "plugin:depend/recommended",
    "plugin:storybook/recommended",
    "plugin:i18next/recommended",
  ],
  settings: {
    "boundaries/elements": boundaryElements,
    "boundaries/ignore": ["**/*.unit.spec.*", "**/e2e/**", "*.stories.*", "test/**"],
    "import/internal-regex": "^metabase/|^metabase-lib/",
    "import/resolver": {
      webpack: {
        config: path.resolve(__dirname, "./rspack.main.config.js"),
        typescript: true,
      },
    },
    "import/ignore": ["\\.css$"],
    react: {
      version: "detect",
    },
    "postcss-modules": {
      baseDir: "./frontend/src",
    },
  },
  parserOptions: {
    ecmaFeatures: {
      legacyDecorators: true,
    },
  },
  overrides: [
    {
      files: ["*.js", "*.jsx", "*.ts", "*.tsx"],
      rules: {
        "jtag-missing-key": "error",
        "no-unconditional-metabase-links-render": "error",
        "no-color-literals": "error",
        "no-literal-metabase-strings": "error",
        "no-oss-reinitialize-import": "error",
        "depend/ban-dependencies": [
          "error",
          {
            allowed: [
              "underscore",
              "moment",
              "lodash.orderby",
              "lodash.debounce",
            ],
          },
        ],
      },
    },
    {
      files: [
        "*.unit.spec.*",
        "frontend/src/metabase/admin/**/*",
        "frontend/src/metabase/setup/**/*",
        "enterprise/frontend/src/metabase-enterprise/whitelabel/**/*",
        "enterprise/frontend/src/metabase-enterprise/embedding/**/*",
        "frontend/lint/**/*",
        "*.stories.*",
        "**/.storybook/*",
        "stories-data.*",
        "e2e/**/*",
        "**/tests/*",
        "release/**/*",
        "rspack.config.js",
        "rspack.main.config.js",
        "rspack.embedding-sdk-package.config.js",
        "rspack.embedding-sdk-bundle.config.js",
      ],
      rules: {
        "no-color-literals": "off",
        "no-unconditional-metabase-links-render": "off",
        "no-literal-metabase-strings": "off",
      },
    },
    {
      files: [
        "*.unit.spec.*",
        "frontend/lint/**/*",
        "*.stories.*",
        "stories-data.*",
        "e2e/**/*",
        "**/tests/*",
        "release/**/*",
        "rspack.main.config.js",
      ],
      rules: {
        "i18next/no-literal-string": "off",
      },
    },
    {
      extends: ["plugin:@typescript-eslint/recommended"],
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      rules: {
        "prefer-rest-params": "off",
        "react/prop-types": "off", // TypeScript handles prop validation
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-this-alias": "off",
        "@typescript-eslint/consistent-type-imports": [
          "error",
          {
            fixStyle: "inline-type-imports",
          },
        ],
        "@typescript-eslint/no-import-type-side-effects": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_.+$",
            varsIgnorePattern: "^_.+$",
            ignoreRestSiblings: true,
            destructuredArrayIgnorePattern: "^_.+$",
          },
        ],
        // This was introduced in 6.0.0
        "@typescript-eslint/no-unsafe-declaration-merging": "off",
      },
    },
    {
      extends: [
        "plugin:jest/recommended",
        "plugin:jest-dom/recommended",
        "plugin:testing-library/react",
        "plugin:jest-formatting/recommended",
      ],
      plugins: ["jest", "jest-dom", "testing-library", "jest-formatting"],
      files: [
        "*.unit.spec.ts",
        "*.unit.spec.tsx",
        "*.unit.spec.js",
        "*.unit.spec.jsx",
      ],
      rules: {
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
    {
      // Enable jest formatting for cypress tests too, the plugin logic just works
      extends: ["plugin:jest-formatting/recommended"],
      files: ["*.cy.spec.ts", "*.cy.spec.js"],
    },
    {
      files: ["frontend/src/**/*"],
      rules: {
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
      files: ["frontend/src/metabase/**/*"],
      rules: {
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
      files: ["frontend/src/metabase/query_builder/**/*"],
      rules: {
        "import/no-cycle": "error",
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
        "no-color-literals": "off",
      },
    },
    {
      files: ["frontend/build/**/*.js"],
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
  ],
};
