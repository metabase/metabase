const { StatsWriterPlugin } = require("webpack-stats-plugin");
const YAML = require("json-to-pretty-yaml");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const BUILD_PATH = __dirname + "/resources/frontend_client";
const CLJS_SRC_PATH = __dirname + "/frontend/src/cljs";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? null : ".babel_cache",
};

module.exports = (env = {}) => {
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
    },

    module: {
      rules: [
        {
          test: /\.(tsx?|jsx?)$/,
          exclude: /node_modules|cljs/,
          use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
        },
      ],
    },
    resolve: {
      extensions: [".webpack.js", ".web.js", ".js", ".jsx", ".ts", ".tsx"],
      alias: {
        metabase: SRC_PATH,
        cljs: CLJS_SRC_PATH,
        "metabase-lib": LIB_SRC_PATH,
      },
    },
    optimization: {
      minimize: !shouldDisableMinimization,
    },
    stats: {
      excludeModules: [/node_modules/],
      source: false,
      reasons: false,
      assets: false,
      chunks: false,
      nestedModules: false,
      optimizationBailout: false,
    },
    plugins: [
      new StatsWriterPlugin({
        stats: {
          modules: true,
          assets: false,
          nestedModules: false,
          reasons: false,
          excludeModules: [/node_modules/],
        },
        filename: "transformed-compilation-stats.yaml",
        transform: stats =>
          YAML.stringify({
            static_viz_sources: stats.modules
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
