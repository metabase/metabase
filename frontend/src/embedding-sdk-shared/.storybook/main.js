/* eslint-disable import/no-commonjs */

const fs = require("fs");
const path = require("path");

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const webpack = require("webpack");

const {
  getBuildInfoValues,
} = require("build-configs/embedding-sdk/rspack/get-build-info-values");

const { isEmbeddingSdkPackageInstalled, embeddingSdkPackageVersion } =
  resolveEmbeddingSdkPackage();

// eslint-disable-next-line no-undef
const rootRepoPath = path.resolve(__dirname, "../../../../");

const appConfig = require(
  path.resolve(rootRepoPath, "rspack.embedding-sdk-bundle.config"),
);

module.exports = {
  stories: [
    path.resolve(
      rootRepoPath,
      "frontend/src/embedding-sdk-{bundle,shared}/**/*.stories.tsx",
    ),
    path.resolve(
      rootRepoPath,
      "enterprise/frontend/src/embedding-sdk-ee/**/*.stories.tsx",
    ),
  ],
  staticDirs: [
    path.resolve(rootRepoPath, "resources/frontend_client"),
    "./msw-public",
  ],
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
        ...getBuildInfoValues({ version: embeddingSdkPackageVersion }),
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
          // $ means that only exact "embedding-sdk-package" imports will be rerouted, all nested embedding-sdk-package/* will still be resolved locally
          "embedding-sdk-package$": require.resolve(
            "@metabase/embedding-sdk-react",
          ),
        }),
      },
      extensions: appConfig.resolve.extensions,
      fallback: {
        ...storybookConfig.resolve?.fallback,
        ...appConfig.resolve?.fallback,
      },
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
        "./enterprise/frontend/src/embedding-sdk-package/package.template.json",
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
