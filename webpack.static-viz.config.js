const YAML = require("json-to-pretty-yaml");
const { StatsWriterPlugin } = require("webpack-stats-plugin");
const { IgnorePlugin } = require("webpack");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const BUILD_PATH = __dirname + "/resources/frontend_client";
const CLJS_SRC_PATH = __dirname + "/frontend/src/cljs_release";
const CLJS_SRC_PATH_DEV = __dirname + "/frontend/src/cljs";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? null : ".babel_cache",
};

const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const devMode = WEBPACK_BUNDLE !== "production";

module.exports = env => {
  const shouldDisableMinimization = env.WEBPACK_WATCH === true;

  return {
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
      publicPath: "/app/dist",
      globalObject: "{}",
    },

    module: {
      rules: [
        {
          test: /\.(tsx?|jsx?)$/,
          exclude: /node_modules|cljs/,
          use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
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
    resolve: {
      extensions: [".webpack.js", ".web.js", ".js", ".jsx", ".ts", ".tsx"],
      alias: {
        metabase: SRC_PATH,
        cljs: devMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
        "metabase-lib": LIB_SRC_PATH,
        "metabase-types": TYPES_SRC_PATH,
      },
    },
    optimization: {
      minimize: !shouldDisableMinimization,
    },
    plugins: [
      new IgnorePlugin({
        resourceRegExp: /\.css$/, // regular expression to ignore all CSS files
        contextRegExp: /./,
      }),
      new StatsWriterPlugin({
        stats: {
          modules: true,
          assets: false,
          nestedModules: false,
          reasons: false,
          excludeModules: [/node_modules/],
        },
        filename: "../../../../.github/static-viz-sources.yaml",
        transform: stats =>
          YAML.stringify({
            static_viz: stats.modules
              .filter(
                module =>
                  module.type !== "hidden modules" &&
                  module.moduleType !== "runtime",
              )
              .map(module =>
                module.nameForCondition.replace(`${__dirname}/`, ""),
              ),
          }),
      }),
    ],
  };
};
