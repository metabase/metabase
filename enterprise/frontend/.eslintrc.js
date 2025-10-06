/* eslint-disable import/no-commonjs */

const TEST_FILES_NAME_PATTERN_ERROR_MESSAGE = `Please name your test setup and utils files with a ".spec.*" in the filename, or put them under "/tests", e.g. "setup.spec.ts", "MyComponent.setup.spec.ts", or "tests/setup.ts". This is to ensure they won't be imported in the SDK build.`;

const baseRestrictedConfig = {
  patterns: [{ group: ["cljs/metabase.lib*"] }],
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
      message: "Please import from `metabase/lib/redux` instead.",
    },
  ],
};

module.exports = {
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
      files: ["**/*.stories.tsx"],
      rules: {
        "import/no-default-export": 0,
        "no-restricted-imports": 0,
      },
    },
  ],
};
