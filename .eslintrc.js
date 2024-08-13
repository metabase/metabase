/* eslint-disable import/no-commonjs */
/* eslint-disable no-undef */

// `postcss-modules` lints css modules class names, but it currently crashes
// eslint on vscode. If you use webstorm or want to run the lint for the cli, you
// can use this flag to enable it. This is set to true in CI
const shouldLintCssModules =
  process.env.LINT_CSS_MODULES === "true" || process.env.CI;

module.exports = {
  rules: {
    strict: [2, "never"],
    "no-undef": 2,
    "no-var": 1,
    "no-unused-vars": [
      "error",
      {
        vars: "all",
        args: "none",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "no-empty": [1, { allowEmptyCatch: true }],
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
    "react-hooks/exhaustive-deps": [
      "warn",
      { additionalHooks: "(useSyncedQueryString|useSafeAsyncFunction)" },
    ],
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
          "describeWithSnowplow",
          "describeEE",
        ],
      },
    ],
    complexity: ["error", { max: 54 }],
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
    es6: true,
    commonjs: true,
    jest: true,
    "jest/globals": true,
  },
  parser: "babel-eslint",
  plugins: ["react", "no-only-tests", "postcss-modules"],
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
  ],
  settings: {
    "import/internal-regex": "^metabase/|^metabase-lib/",
    "import/resolver": {
      webpack: {
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
        "no-unconditional-metabase-links-render": "error",
        "no-literal-metabase-strings": "error",
      },
    },
    {
      files: [
        "*.unit.spec.*",
        "frontend/src/metabase/admin/**/*",
        "frontend/src/metabase/setup/**/*",
        "frontend/lint/**/*",
        "*.stories.*",
        "e2e/**/*",
        "**/tests/*",
        "release/**/*",
      ],
      rules: {
        "no-unconditional-metabase-links-render": "off",
        "no-literal-metabase-strings": "off",
      },
    },
    {
      extends: ["plugin:@typescript-eslint/recommended"],
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      rules: {
        "prefer-rest-params": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-this-alias": "off",
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            ignoreRestSiblings: true,
            destructuredArrayIgnorePattern: "^_",
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
      ],
      plugins: ["jest", "jest-dom", "testing-library"],
      files: [
        "*.unit.spec.ts",
        "*.unit.spec.tsx",
        "*.unit.spec.js",
        "*.unit.spec.jsx",
      ],
      rules: {
        "jest/valid-title": ["error", { ignoreTypeOfDescribeName: true }],
      },
    },
  ],
};
