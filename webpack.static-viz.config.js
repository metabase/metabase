const webpack = require("webpack");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const BUILD_PATH = __dirname + "/resources/frontend_client";

const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const devMode = WEBPACK_BUNDLE !== "production";

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? null : ".babel_cache",
  plugins: devMode ? ["@emotion", "react-refresh/babel"] : ["@emotion"],
  presets: [],
};

const LOADERS = [
  { loader: "babel-loader", options: BABEL_CONFIG },
  {
    loader: "esbuild-loader",
    options: {
      loader: "tsx",
      target: "es6",
      jsxFactory: "_jsx",
    },
  },
];

module.exports = {
  mode: "production",
  context: SRC_PATH,

  performance: {
    hints: false,
  },

  entry: {
    "lib-static-viz": {
      import: "./static-viz/index.js",
      library: {
        name: "StaticViz",
        type: "var",
      },
    },
  },

  output: {
    path: BUILD_PATH + "/app/dist",
    filename: "[name].bundle.js",
  },

  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules/,
        use: LOADERS,
      },
    ],
  },

  plugins: [
    new webpack.ProvidePlugin({
      React: "react",
      _jsx: ["@emotion/core", "jsx"],
    }),
  ],

  resolve: {
    extensions: [".webpack.js", ".web.js", ".js", ".jsx", ".ts", ".tsx"],
    alias: {
      metabase: SRC_PATH,
    },
  },
};
