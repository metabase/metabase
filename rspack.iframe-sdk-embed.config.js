/* eslint-disable import/no-commonjs */
/* eslint-disable no-undef */

const path = require("path");

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const SCRIPT_TAG_PATH = path.resolve(
  ENTERPRISE_SRC_PATH,
  "embedding_iframe_sdk/embed.v1.ts",
);

const BUILD_PATH = __dirname + "/resources/frontend_client";

module.exports = {
  name: "iframe_sdk_embed_v1",
  entry: SCRIPT_TAG_PATH,
  output: {
    // we must use a different directory than the main rspack (app/dist),
    // otherwise the path conflicts and the output bundle will not appear.
    path: BUILD_PATH + "/app",
    filename: "embed.v1.js",
    library: "metabase.embed",
    libraryTarget: "umd",
    globalObject: "this",
  },
  devServer: { hot: false },
  module: {
    rules: [
      {
        test: /\.(ts|js)$/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                loose: true,
                transform: {},
                parser: { syntax: "typescript" },
              },
              sourceMaps: false,
              minify: false,
              env: { targets: ["defaults"] },
            },
          },
        ],
        type: "javascript/auto",
      },
    ],
  },
  optimization: { splitChunks: false, runtimeChunk: false },
  devtool: false,
};
