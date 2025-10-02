/* eslint-disable no-undef,import/no-commonjs */
const path = require("path");

module.exports = {
  settings: {
    "import/resolver": {
      webpack: {
        config: path.resolve(
          __dirname,
          "../../../../webpack.embedding-sdk.config.js",
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
          {
            name: "metabase/lib/redux",
            importNames: ["useStore", "useDispatch"],
            message: 'Please use "useSdkStore", "useSdkDispatch"',
          },
        ],
      },
    ],
  },
};
