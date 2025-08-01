/* eslint-disable import/no-commonjs */
/* eslint-disable no-undef */

const path = require("path");

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const SCRIPT_TAG_PATH = path.resolve(
  ENTERPRISE_SRC_PATH,
  "embedding_iframe_sdk/embed.ts",
);

const BUILD_PATH = __dirname + "/resources/frontend_client";
const EMBEDDING_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding";
const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";

const OUT_FILE_NAME = "embed.js";
const EMBED_PATH = path.resolve(BUILD_PATH, "embed");

const DEV_PORT = process.env.PORT || 8080; // same as main config

module.exports = {
  name: "iframe_sdk_embed_v1",
  entry: SCRIPT_TAG_PATH,
  output: {
    path: EMBED_PATH,
    filename: OUT_FILE_NAME,
    library: "metabase.embed",
    libraryTarget: "umd",
    globalObject: "this",
    clean: true,

    // this makes the dev server serve the file from localhost:8080/app/embed.js, so that we could use it
    // in cypress tests with hot reload
    publicPath: `http://localhost:${DEV_PORT}/app`,
  },
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
  plugins: [],
  resolve: {
    extensions: [".js", ".ts"],
    alias: {
      embedding: EMBEDDING_SRC_PATH,
      "embedding-sdk": SDK_SRC_PATH,
    },
  },
};
