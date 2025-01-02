import type { StorybookConfig } from "@storybook/react-webpack5";
const appConfig = require("../webpack.config");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const mainAppStories = [
  "../frontend/**/*.mdx",
  "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
];

const config: StorybookConfig = {
  stories: mainAppStories,
  staticDirs: ["../resources/frontend_client"],
  addons: [
    "@storybook/addon-webpack5-compiler-swc",
    "@storybook/addon-interactions",
    "@storybook/addon-essentials",
    "@storybook/addon-links",
    "@storybook/addon-a11y",
    "storybook-addon-pseudo-states",
  ],

  framework: {
    name: "@storybook/react-webpack5",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
  swc: (config, options) => {
    console.log({ config });
    return {
      jsc: {
        loose: true,
        transform: {
          react: {
            runtime: "automatic",
          },
        },
        parser: {
          syntax: "typescript",
          tsx: true,
        },
        experimental: {
          plugins: [["@swc/plugin-emotion", {}]],
        },
      },
    };
  },

  webpackFinal: config => {
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          ...appConfig.resolve.alias,
        },
        extensions: appConfig.resolve.extensions,
      },
      plugins: [
        ...(config.plugins ?? []),
        new MiniCssExtractPlugin(),
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
        new webpack.EnvironmentPlugin({
          IS_EMBEDDING_SDK: false,
        }),
      ],
      module: {
        ...config.module,
        rules: [
          ...(config.module?.rules ?? []).filter(
            rule => !isCSSRule(rule) && !isSvgRule(rule),
          ),
          ...appConfig.module.rules.filter(
            rule => isCSSRule(rule) || isSvgRule(rule),
          ),
        ],
      },
    };
  },
};
export default config;

// const appConfig = require("../webpack.config");
// const fs = require("fs");
// const path = require("path");

// module.exports = {
//   core: {
//     builder: "webpack5",
//   },
//   stories: mainAppStories,
//   staticDirs: ["../resources/frontend_client"],
//   addons: [
// "@storybook/addon-essentials",
// "@storybook/addon-links",
// "@storybook/addon-a11y",
// "@storybook/addon-interactions",
// "storybook-addon-pseudo-states",
//   ],
//   features: {
//     interactionsDebugger: true,
//   },
//   babel: () => {},
//   typescript: {
//     reactDocgen: "react-docgen-typescript-plugin",
//   },
//   webpackFinal: storybookConfig => ({
//     ...storybookConfig,
// plugins: [
//   ...storybookConfig.plugins,
//   new MiniCssExtractPlugin(),
//   new webpack.ProvidePlugin({
//     Buffer: ["buffer", "Buffer"],
//   }),
//   new webpack.EnvironmentPlugin({
//     IS_EMBEDDING_SDK: false,
//   }),
// ],
//     module: {
//       ...storybookConfig.module,
//       rules: [
//         ...storybookConfig.module.rules.filter(
//           rule => !isCSSRule(rule) && !isSvgRule(rule),
//         ),
//         ...appConfig.module.rules.filter(
//           rule => isCSSRule(rule) || isSvgRule(rule),
//         ),
//       ],
//     },
// resolve: {
//   ...storybookConfig.resolve,
//   alias: {
//     ...appConfig.resolve.alias,
//   },
//   extensions: appConfig.resolve.extensions,
// },
//   }),
// };

const isCSSRule = rule => rule.test?.toString() === "/\\.css$/";
const isSvgRule = rule => rule.test?.test(".svg");
