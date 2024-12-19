const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const appConfig = require("../webpack.config");
const fs = require("fs");
const path = require("path");

const mainAppStories = [
  "../frontend/**/*.stories.mdx",
  "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
];

module.exports = {
  core: {
    builder: "webpack5",
  },
  stories: mainAppStories,
  staticDirs: ["../resources/frontend_client"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
    "@storybook/addon-interactions",
    "storybook-addon-pseudo-states",
  ],
  features: {
    interactionsDebugger: true,
  },
  babel: () => {},
  typescript: {
    reactDocgen: "react-docgen-typescript-plugin",
  },
  webpackFinal: storybookConfig => ({
    ...storybookConfig,
    plugins: [
      ...storybookConfig.plugins,
      new MiniCssExtractPlugin(),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new webpack.EnvironmentPlugin({
        IS_EMBEDDING_SDK: false,
      }),
    ],
    module: {
      ...storybookConfig.module,
      rules: [
        ...storybookConfig.module.rules.filter(
          rule => !isCSSRule(rule) && !isSvgRule(rule),
        ),
        ...appConfig.module.rules.filter(
          rule => isCSSRule(rule) || isSvgRule(rule),
        ),
      ],
    },
    resolve: {
      ...storybookConfig.resolve,
      alias: {
        ...appConfig.resolve.alias,
      },
      extensions: appConfig.resolve.extensions,
    },
  }),
};

const isCSSRule = rule => rule.test.toString() === "/\\.css$/";
const isSvgRule = rule => rule.test && rule.test?.test(".svg");
