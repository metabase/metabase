const webpack = require("webpack");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const appConfig = require("../rspack.embedding-sdk-bundle.config");
const fs = require("fs");
const path = require("path");
const {
  INJECTED_BUILD_INFO_VALUES,
} = require("../frontend/build/embedding-sdk/constants/injected-build-info-values");

const {
  isEmbeddingSdkPackageInstalled,
  embeddingSdkPackageVersion: EMBEDDING_SDK_PACKAGE_VERSION,
} = resolveEmbeddingSdkPackage();

module.exports = {
  stories: ["../enterprise/frontend/src/embedding-sdk/**/*.stories.tsx"],
  staticDirs: ["../resources/frontend_client", "./msw-public"],
  addons: [
    "@storybook/addon-webpack5-compiler-babel",
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
    reactDocgen: false,
  },
  webpackFinal: (storybookConfig) => ({
    ...storybookConfig,
    plugins: [
      ...storybookConfig.plugins,
      new MiniCssExtractPlugin(),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new webpack.EnvironmentPlugin({
        IS_EMBEDDING_SDK: "true",
        EMBEDDING_SDK_PACKAGE_VERSION,
        ...INJECTED_BUILD_INFO_VALUES,
      }),
    ],
    module: {
      ...storybookConfig.module,
      rules: [
        ...storybookConfig.module.rules.filter(
          (rule) => !isCSSRule(rule) && !isSvgRule(rule),
        ),
        ...appConfig.module.rules.filter(
          (rule) => isCSSRule(rule) || isSvgRule(rule),
        ),
      ],
    },
    resolve: {
      ...storybookConfig.resolve,
      alias: {
        ...appConfig.resolve.alias,
        ...(isEmbeddingSdkPackageInstalled && {
          // $ means that only exact "embedding-sdk" imports will be rerouted, all nested embedding-sdk/* will still be resolved locally
          "embedding-sdk$": require.resolve("@metabase/embedding-sdk-react"),
        }),
      },
      extensions: appConfig.resolve.extensions,
    },
  }),
};

const isCSSRule = (rule) => rule.test?.toString() === "/\\.css$/";
const isSvgRule = (rule) => rule.test && rule.test?.test(".svg");

function resolveEmbeddingSdkPackage() {
  let isEmbeddingSdkPackageInstalled = false;
  let embeddingSdkPackageVersion;

  try {
    const packagePath = require.resolve("@metabase/embedding-sdk-react");
    if (packagePath.includes("node_modules")) {
      isEmbeddingSdkPackageInstalled = true;
    }

    const packageJsonContent = fs.readFileSync(
      path.join(packagePath, "package.json"),
      "utf-8",
    );
    embeddingSdkPackageVersion = JSON.stringify(
      JSON.parse(packageJsonContent)?.version,
    );
  } catch (err) {
    const sdkPackageTemplateJson = fs.readFileSync(
      path.resolve(
        "./enterprise/frontend/src/embedding-sdk/package.template.json",
      ),
      "utf-8",
    );
    const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);
    embeddingSdkPackageVersion = JSON.stringify(
      sdkPackageTemplateJsonContent.version,
    );
  }

  return {
    isEmbeddingSdkPackageInstalled,
    embeddingSdkPackageVersion,
  };
}
