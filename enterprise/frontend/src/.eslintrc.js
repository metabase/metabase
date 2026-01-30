/* eslint-disable no-undef,import/no-commonjs */
const path = require("path");

const TEST_FILES_NAME_PATTERN_ERROR_MESSAGE = `Please name your test setup and utils files with a ".spec.*" in the filename, or put them under "/tests", e.g. "setup.spec.ts", "MyComponent.setup.spec.ts", or "tests/setup.ts". This is to ensure they won't be imported in the SDK build.`;

const baseRestrictedConfig = {
  patterns: [
    { group: ["cljs/metabase.lib*"] },
    {
      group: ["metabase-types/openapi", "metabase-types/openapi/**"],
      message:
        "Direct imports from metabase-types/openapi are restricted. Reexport types under readable names from metabase-types/api instead.",
    },
  ],
  paths: [
    {
      name: "@mantine/core",
      message: "Please import from `metabase/ui` instead.",
    },
    {
      name: "moment",
      message: "Moment is deprecated, please use dayjs",
    },
    {
      name: "moment-timezone",
      message: "Moment is deprecated, please use dayjs",
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
};

module.exports = {
  settings: {
    "import/resolver": {
      webpack: {
        config: path.resolve(
          __dirname,
          "../../../rspack.embedding-sdk-bundle.config.js",
        ),
        typescript: true,
      },
    },
  },
  rules: {
    // Note: adding this rule to a eslint config file in a subfolder will remove
    // *not* carry over the restricted imports from parent folders, you will
    // need to copy them over
    "no-restricted-imports": [
      "error",
      {
        ...baseRestrictedConfig,
        patterns: [
          ...baseRestrictedConfig.patterns,
          {
            group: ["__support__/**", "!__support__/metadata"],
            message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
          },
        ],
      },
    ],
    "ttag/no-module-declaration": 2,
  },
  overrides: [
    {
      files: ["embedding-sdk-{package,bundle,shared}/**/*.{ts,tsx,js,jsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              ...baseRestrictedConfig.patterns,
              {
                group: ["__support__/**"],
                message: TEST_FILES_NAME_PATTERN_ERROR_MESSAGE,
              },
            ],
            paths: [
              ...baseRestrictedConfig.paths,
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
        "**/*.spec.*",
        "**/test-utils.*",
        "**/tests/**/*",
        "**/test/**/*",
      ],
      rules: {
        "no-restricted-imports": ["error", baseRestrictedConfig],
      },
    },
    {
      files: ["**/.storybook/*", "**/*.stories.tsx"],
      rules: {
        "import/no-default-export": 0,
        "no-restricted-imports": 0,
      },
    },
    {
      files: ["**/metabase-types/**/*.{ts,tsx,js,jsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [{ group: ["cljs/metabase.lib*"] }],
            paths: baseRestrictedConfig.paths,
          },
        ],
      },
    },
    {
      files: ["embedding-sdk-{package,shared}/**/*.{ts,tsx,js,jsx}"],
      excludedFiles: [
        "embedding-sdk-package/{bin,cli}/**/*.{ts,tsx,js,jsx}",
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
              path.join(__dirname, "embedding-sdk-package"),
              path.resolve(
                __dirname,
                "../../../frontend/src/embedding-sdk-shared",
              ),
            ],
          },
        ],
      },
    },
  ],
};
