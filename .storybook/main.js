const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const appConfig = require("../webpack.config");
const fs = require("fs");
const path = require("path");

const isEmbeddingSDK = process.env.IS_EMBEDDING_SDK === "true";
console.log({ isEmbeddingSDK });

const mainAppStories = [
  "../frontend/**/*.mdx",
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

const config = {
  framework: {
    name: "@storybook/react-webpack5",
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
    legacyMdx1: true,
  },
  babel: () => {},
  typescript: {
    reactDocgen: "react-docgen-typescript-plugin",
  },
  webpackFinal: storybookConfig => {
    console.log(storybookConfig.module.rules);
    return {
      ...storybookConfig,
      plugins: [
        ...storybookConfig.plugins,

        new MiniCssExtractPlugin({
          filename: "[name].css",
          chunkFilename: "[id].css",
        }),
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
        }),
        new webpack.EnvironmentPlugin({
          EMBEDDING_SDK_VERSION,
          IS_EMBEDDING_SDK_BUILD: isEmbeddingSDK,
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
    };
  },
};

export default config;

const isCSSRule = rule => {
  // console.log({ test: rule.test });
  const res = rule?.test?.toString() === "/\\.css$/";
  if (res) {
    console.log({ rule });
  }
  return res;
};
const isSvgRule = rule => rule.test && rule.test?.test(".svg");
