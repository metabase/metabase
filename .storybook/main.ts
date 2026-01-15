import type { StorybookConfig } from "@storybook/react-webpack5";
const appConfig = require("../rspack.main.config.js");
const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const { CSS_CONFIG } = require("../frontend/build/shared/rspack/css-config");

const mainAppStories = [
  "../frontend/**/*.mdx",
  "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
  "../enterprise/frontend/**/*.stories.@(js|jsx|ts|tsx)",
];

const config: StorybookConfig = {
  stories: mainAppStories,
  staticDirs: ["../resources/frontend_client", "./msw-public"],
  addons: [
    "@storybook/addon-webpack5-compiler-babel",
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
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

  webpackFinal: (config) => {
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve?.alias,
          ...appConfig.resolve.alias,
        },
        extensions: appConfig.resolve.extensions,
        fallback: {
          ...config.resolve?.fallback,
          ...appConfig.resolve.fallback,
        },
      },
      plugins: [
        ...(config.plugins ?? []),
        new MiniCssExtractPlugin({
          ignoreOrder: true,
        }),
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
        new webpack.EnvironmentPlugin({
          IS_EMBEDDING_SDK: "false",
        }),
      ],
      module: {
        ...config.module,
        rules: [
          ...(config.module?.rules ?? []).filter(
            (rule) => !isCSSRule(rule) && !isSvgRule(rule),
          ),
          ...appConfig.module.rules.filter((rule: any) => isSvgRule(rule)),
          // We use MiniCssExtractPlugin, because Storybook can't properly work with `rspack.CssExtractRspackPlugin`
          {
            test: /\.css$/,
            use: [
              {
                loader: MiniCssExtractPlugin.loader,
                options: { publicPath: "./" },
              },
              { loader: "css-loader", options: CSS_CONFIG },
              { loader: "postcss-loader" },
            ],
          },
        ],
      },
    };
  },
};
export default config;

const isCSSRule = (rule: any) => rule.test?.toString() === "/\\.css$/";
const isSvgRule = (rule: any) => rule.test?.test(".svg");
