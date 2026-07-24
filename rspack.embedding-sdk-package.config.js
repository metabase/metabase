/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const rspack = require("@rspack/core");

const mainConfig = require("./rspack.main.config");
const {
  OPTIMIZATION_CONFIG,
} = require("./frontend/build/embedding-sdk/rspack/shared");
const { BABEL_CONFIG } = require("./frontend/build/shared/rspack/babel-config");
const { CSS_CONFIG } = require("./frontend/build/shared/rspack/css-config");
const {
  EXTERNAL_DEPENDENCIES,
} = require("./frontend/build/embedding-sdk/constants/external-dependencies");
const {
  DATA_APP_DEV_CONFIG_VIRTUAL_ID,
} = require("./frontend/build/embedding-sdk/constants/data-app-virtual-modules");
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

const baseConfig = {
  context: SDK_PACKAGE_SRC_PATH,

  devtool: false,

  entry: {
    main: "./index.ts",
    "data-app": "./data-app.ts",
  },

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
      {
        // The published package has no separate stylesheet for consumers to
        // import, and components like the dev toolbar must render standalone
        // before the SDK bundle (and its CSS) loads. style-loader injects the
        // CSS modules at runtime so they ship inside the JS bundle itself.
        test: /\.css$/,
        use: [
          { loader: "style-loader" },
          { loader: "css-loader", options: CSS_CONFIG },
          { loader: "postcss-loader" },
        ],
        type: "javascript/auto",
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
      maxChunks: 3,
    }),
    new rspack.BannerPlugin(getBannerOptions(SDK_PACKAGE_BANNER)),
  ].filter(Boolean),
};

const esmConfig = {
  ...baseConfig,

  entry: {
    "main.esm": "./index.ts",
    "data-app.esm": "./data-app.ts",
    "data-app-dev": "./data-app-dev.ts",
  },

  output: {
    ...baseConfig.output,
    filename: "[name].js",
    library: {
      type: "module",
    },
  },

  externalsType: "module",

  experiments: {
    outputModule: true,
  },
};

// The data-app dev entry is its own ESM build. It keeps the consumer's React/SDK
// and the dev plugin's virtual config external (so the bundle runs against the
// consumer's single React/SDK instance), with those extra externals scoped HERE
// so they can't affect the SDK (`main` / `data-app`) builds above.
const dataAppDevEntryConfig = {
  ...esmConfig,

  entry: {
    "data-app-dev-entry": "./data-app-dev-entry.tsx",
  },

  externals: [
    ...Object.keys(EXTERNAL_DEPENDENCIES),
    "react/jsx-dev-runtime",
    "@metabase/embedding-sdk-react",
    "@metabase/embedding-sdk-react/data-app",
    "@metabase/embedding-sdk-react/data-app-dev",
    DATA_APP_DEV_CONFIG_VIRTUAL_ID,
  ],

  // Leave `import.meta` untouched so the consumer's Vite (not rspack) resolves it
  // at serve time — `import.meta.env.DATA_APP_MB_*` for auth and `import.meta.hot`
  // for the soft reload. Without this, rspack evaluates them to `undefined`.
  module: {
    ...baseConfig.module,
    parser: { javascript: { importMeta: false } },
  },
};

module.exports = [baseConfig, esmConfig, dataAppDevEntryConfig];
