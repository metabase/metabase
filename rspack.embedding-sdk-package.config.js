/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const rspack = require("@rspack/core");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const mainConfig = require("./rspack.main.config");
const { resolve } = require("path");
const {
  TypescriptConvertErrorsToWarnings,
} = require("./frontend/build/embedding-sdk/rspack/typescript-convert-errors-to-warnings");
const { IS_DEV_MODE } = require("./frontend/build/shared/constants");
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

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const BUILD_PATH = __dirname + "/resources/embedding-sdk";

const skipDTS = process.env.SKIP_DTS === "true";

const isDevMode = IS_DEV_MODE;

const EMBEDDING_SDK_BUNDLE_HOST = process.env.EMBEDDING_SDK_BUNDLE_HOST || "";

const config = {
  context: SDK_SRC_PATH,

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
      EMBEDDING_SDK_BUNDLE_HOST,
    }),
    new rspack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new rspack.BannerPlugin(getBannerOptions(SDK_PACKAGE_BANNER)),
    !skipDTS &&
      new ForkTsCheckerWebpackPlugin({
        async: isDevMode,
        typescript: {
          configFile: resolve(__dirname, "./tsconfig.sdk.json"),
          mode: "write-dts",
          memoryLimit: 4096,
        },
      }),
    new TypescriptConvertErrorsToWarnings(),
  ].filter(Boolean),
};

module.exports = config;
