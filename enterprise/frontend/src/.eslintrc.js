/* eslint-disable no-undef,import/no-commonjs */
const path = require("path");

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
            message: "Please import from `metabase/lib/redux` instead.",
          },
        ],
      },
    ],
    "ttag/no-module-declaration": 2,
  },
  overrides: [
    {
      files: ["**/*.stories.tsx"],
      rules: {
        "import/no-default-export": 0,
        "no-restricted-imports": 0,
      },
    },
    {
      files: [
        "embedding-sdk-bundle/sdk-package/**/*.{ts,tsx,js,jsx}",
        "embedding-sdk-shared/**/*.{ts,tsx,js,jsx}",
      ],
      excludedFiles: [
        "**/test/**",
        "**/*.spec.{ts,tsx,js,jsx}",
        "**/*.stories.{ts,tsx,js,jsx}",
      ],
      rules: {
        "no-external-references-for-sdk-package-code": [
          "error",
          {
            allowedPaths: [
              path.join(__dirname, "embedding-sdk-bundle/sdk-package"),
              path.join(__dirname, "embedding-sdk-shared"),
            ],
          },
        ],
      },
    },
  ],
};
