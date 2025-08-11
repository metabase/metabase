/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const rspack = require("@rspack/core");
const BundleAnalyzerPlugin =
  require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const mainConfig = require("./rspack.main.config");
const { resolve } = require("path");
const fs = require("fs");
const path = require("path");

const {
  TypescriptConvertErrorsToWarnings,
} = require("./frontend/build/embedding-sdk/rspack/typescript-convert-errors-to-warnings");
const {
  LICENSE_TEXT,
  IS_DEV_MODE,
} = require("./frontend/build/shared/constants");
const {
  OPTIMIZATION_CONFIG,
} = require("./frontend/build/embedding-sdk/rspack/shared");
const { BABEL_CONFIG } = require("./frontend/build/shared/rspack/babel-config");
const { CSS_CONFIG } = require("./frontend/build/shared/rspack/css-config");
const {
  getBannerOptions,
} = require("./frontend/build/shared/rspack/get-banner-options");

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const BUILD_PATH = __dirname + "/resources/embedding-sdk";

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const skipDTS = process.env.SKIP_DTS === "true";

const isDevMode = IS_DEV_MODE;

const sdkPackageTemplateJson = fs.readFileSync(
  path.resolve(
    path.join(
      __dirname,
      "enterprise/frontend/src/embedding-sdk/package.template.json",
    ),
  ),
  "utf-8",
);
const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);
const EMBEDDING_SDK_VERSION = sdkPackageTemplateJsonContent.version;

const shouldAnalyzeBundles = process.env.SHOULD_ANALYZE_BUNDLES === "true";

const config = {
  ...mainConfig,

  // Same behavior as for webpack: https://rspack.rs/config/other-options#amd
  amd: {},

  context: SDK_SRC_PATH,

  entry: "./index.ts",

  output: {
    path: BUILD_PATH + "/dist",
    publicPath: "",
    filename: "[name].bundle.js",
    library: {
      type: "commonjs2",
    },
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
      {
        test: /\.(svg|png)$/,
        type: "asset/inline",
        resourceQuery: { not: [/component|source/] },
      },
      {
        test: /\.css$/,
        use: [
          { loader: "style-loader" },
          { loader: "css-loader", options: CSS_CONFIG },
          { loader: "postcss-loader" },
        ],
      },

      {
        test: /\.js$/,
        exclude: /node_modules/,
        enforce: "pre",
        use: ["source-map-loader"],
      },

      {
        test: /\.svg/,
        type: "asset/source",
        resourceQuery: /source/, // *.svg?source
      },
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        resourceQuery: /component/, // *.svg?component
        use: [
          {
            loader: "@svgr/webpack",
            options: {
              ref: true,
            },
          },
        ],
      },
    ],
  },

  // Prevent these dependencies from being included in the JavaScript bundle.
  externals: [
    mainConfig.externals,

    // We intend to support multiple React versions in the SDK,
    // so the SDK itself should not pre-bundle react and react-dom
    "react",
    /^react\//i,
    "react-dom",
    /^react-dom\//i,
  ],

  optimization: OPTIMIZATION_CONFIG,

  plugins: [
    new rspack.BannerPlugin(getBannerOptions(LICENSE_TEXT)),
    new NodePolyfillPlugin(), // for crypto, among others
    // https://github.com/remarkjs/remark/discussions/903
    new rspack.ProvidePlugin({
      process: "process/browser.js",
    }),
    new rspack.EnvironmentPlugin({
      EMBEDDING_SDK_VERSION,
      GIT_BRANCH: require("child_process")
        .execSync("git rev-parse --abbrev-ref HEAD")
        .toString()
        .trim(),
      GIT_COMMIT: require("child_process")
        .execSync("git rev-parse HEAD")
        .toString()
        .trim(),
      IS_EMBEDDING_SDK: "true",
    }),
    new rspack.DefinePlugin({
      "process.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
    }),
    !skipDTS &&
      new ForkTsCheckerWebpackPlugin({
        async: isDevMode,
        typescript: {
          configFile: resolve(__dirname, "./tsconfig.sdk.json"),
          mode: "write-dts",
          memoryLimit: 4096,
        },
      }),
    // we don't want to fail the build on type errors, we have a dedicated type check step for that
    new TypescriptConvertErrorsToWarnings(),
    shouldAnalyzeBundles &&
      new BundleAnalyzerPlugin({
        analyzerMode: "static",
        reportFilename: BUILD_PATH + "/dist/report.html",
      }),
  ].filter(Boolean),
};

config.resolve.alias = {
  ...mainConfig.resolve.alias,
  "sdk-ee-plugins": ENTERPRISE_SRC_PATH + "/sdk-plugins",
  "sdk-iframe-embedding-ee-plugins":
    ENTERPRISE_SRC_PATH + "/sdk-iframe-embedding-plugins",
  "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",

  // Allows importing side effects that applies only to the SDK.
  "sdk-specific-imports": SDK_SRC_PATH + "/lib/sdk-specific-imports.ts",
};

if (config.cache) {
  config.cache.cacheDirectory = resolve(
    __dirname,
    "node_modules/.cache/",
    "webpack-ee",
  );
}

module.exports = config;
