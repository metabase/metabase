const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const appConfig = require("../webpack.config");
const fs = require("fs");
const path = require("path");
const { features } = require("process");

const isEmbeddingSDK = process.env.IS_EMBEDDING_SDK === "true";

const mainAppStories = [
  "../frontend/**/*.stories.mdx",
  "../frontend/**/*.stories.@(js|jsx|ts|tsx)",
];

const embeddingSdkStories = [
  "../enterprise/frontend/src/embedding-sdk/**/*.stories.tsx",
];

const sdkPackageTemplateJson = fs.readFileSync(
  path.resolve("./enterprise/frontend/src/embedding-sdk/package.template.json"),
  "utf-8",
);
const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);
const EMBEDDING_SDK_VERSION = JSON.stringify(
  sdkPackageTemplateJsonContent.version,
);

module.exports = {
  core: {
    builder: "webpack5",
  },
  stories: isEmbeddingSDK ? embeddingSdkStories : mainAppStories,
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
        EMBEDDING_SDK_VERSION,
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
      alias: appConfig.resolve.alias,
      extensions: appConfig.resolve.extensions,
    },
  }),
};

const isCSSRule = rule => rule.test.toString() === "/\\.css$/";
const isSvgRule = rule => rule.test && rule.test?.test(".svg");
