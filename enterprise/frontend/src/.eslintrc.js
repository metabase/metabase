/* eslint-disable no-undef,import/no-commonjs */
const path = require("path");

const baseRestrictredConfig = {
  patterns: ["cljs/metabase.lib*"],
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
    "no-restricted-imports": ["error", baseRestrictredConfig],
    "ttag/no-module-declaration": 2,
  },
  overrides: [
    {
      files: ["embedding-sdk-{package,bundle,shared}/**/*.{ts,tsx,js,jsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            ...baseRestrictredConfig,
            paths: [
              ...baseRestrictredConfig.paths,
              {
                name: "zod",
                message: "Please import from `zod/mini` instead.",
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
      files: ["**/.storybook/*", "**/*.stories.tsx"],
      rules: {
        "import/no-default-export": 0,
        "no-restricted-imports": 0,
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
        "no-external-references-for-sdk-package-code": [
          "error",
          {
            allowedPaths: [
              path.join(__dirname, "embedding-sdk-package"),
              path.join(__dirname, "embedding-sdk-shared"),
            ],
          },
        ],
      },
    },
  ],
};
