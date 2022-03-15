const SRC_PATH = __dirname + "/frontend/src/metabase";
const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const BUILD_PATH = __dirname + "/resources/frontend_client";

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? null : ".babel_cache",
};

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
        use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
      },
      {
        test: /\.(eot|woff2?|ttf|svg|png)$/,
        type: "asset/resource",
      },
    ],
  },
  resolve: {
    extensions: [".webpack.js", ".web.js", ".js", ".jsx", ".ts", ".tsx"],
    alias: {
      assets: ASSETS_PATH,
      metabase: SRC_PATH,
    },
  },
};
