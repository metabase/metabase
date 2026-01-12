/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const rspack = require("@rspack/core");

const mainConfig = require("./rspack.main.config");
const {
  OPTIMIZATION_CONFIG,
} = require("./frontend/build/embedding-sdk/rspack/shared");
const { BABEL_CONFIG } = require("./frontend/build/shared/rspack/babel-config");
const {
  EXTERNAL_DEPENDENCIES,
} = require("./frontend/build/embedding-sdk/constants/external-dependencies");
const {
  SDK_PACKAGE_BANNER,
} = require("./frontend/build/embedding-sdk/constants/banner");
const {
  getBannerOptions,
} = require("./frontend/build/shared/rspack/get-banner-options");
const {
  getBuildInfoValues,
} = require("./frontend/build/embedding-sdk/rspack/get-build-info-values");
const {
  getSdkPackageVersionFromPackageJson,
} = require("./frontend/build/embedding-sdk/lib/get-sdk-package-version-from-package-json");

const SDK_PACKAGE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/embedding-sdk-package";

const BUILD_PATH = __dirname + "/resources/embedding-sdk";

const EMBEDDING_SDK_BUNDLE_HOST = process.env.EMBEDDING_SDK_BUNDLE_HOST || "";

const config = {
  context: SDK_PACKAGE_SRC_PATH,

  devtool: false,

  entry: "./index.ts",

  output: {
    path: BUILD_PATH + "/dist",
    publicPath: "",
    filename: "[name].bundle.js",
    library: {
      type: "commonjs2",
    },
  },

  resolve: {
    ...mainConfig.resolve,
  },

  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules|cljs/,
        use: [
          {
            loader: "babel-loader",
            options: {
              cacheDirectory: BABEL_CONFIG.cacheDirectory,
            },
          },
        ],
      },
    ],
  },

  externals: Object.keys(EXTERNAL_DEPENDENCIES),

  optimization: OPTIMIZATION_CONFIG,

  plugins: [
    new rspack.EnvironmentPlugin({
      IS_EMBEDDING_SDK: "true",
      EMBEDDING_SDK_BUNDLE_HOST,
      ...getBuildInfoValues({ version: getSdkPackageVersionFromPackageJson() }),
    }),
    new rspack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new rspack.BannerPlugin(getBannerOptions(SDK_PACKAGE_BANNER)),
  ].filter(Boolean),
};

module.exports = config;
