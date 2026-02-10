/* eslint-disable import/no-commonjs */
/* eslint-disable no-undef */

const path = require("path");

const {
  CopyJsFromTmpDirectoryPlugin,
} = require("./frontend/build/shared/rspack/copy-js-from-tmp-directory-plugin");

const SRC_PATH = __dirname + "/frontend/src/metabase";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const SCRIPT_TAG_PATH = path.resolve(
  SRC_PATH,
  "embedding/embedding-iframe-sdk/embed.ts",
);

const BUILD_PATH = __dirname + "/resources/frontend_client";
const EMBEDDING_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding";
const SDK_BUNDLE_SRC_PATH = __dirname + "/frontend/src/embedding-sdk-bundle";

const OUT_FILE_NAME = "embed.js";
const OUT_TEMP_PATH = path.resolve(BUILD_PATH, "tmp-embed-js");

const DEV_PORT = process.env.MB_FRONTEND_DEV_PORT || 8080;

const resolveEnterprisePathOrNoop = (path) =>
  process.env.MB_EDITION === "ee"
    ? ENTERPRISE_SRC_PATH + path
    : SRC_PATH + "/lib/noop";

module.exports = {
  name: "iframe_sdk_embed_v1",
  entry: SCRIPT_TAG_PATH,
  output: {
    // we must use a different directory than the main rspack config,
    // otherwise the path conflicts and the output bundle will not appear.
    path: OUT_TEMP_PATH,
    filename: OUT_FILE_NAME,
    library: "metabase.embed",
    libraryTarget: "umd",
    globalObject: "this",
    publicPath: `http://localhost:${DEV_PORT}/app`,
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
  plugins: [
    CopyJsFromTmpDirectoryPlugin({
      fileName: OUT_FILE_NAME,
      tmpPath: OUT_TEMP_PATH,
      outputPath: path.join(BUILD_PATH, "app/"),
      copySourceMap: false,
      cleanupInDevMode: true,
    }),
  ],
  resolve: {
    extensions: [".js", ".ts"],
    alias: {
      metabase: SRC_PATH,
      embedding: EMBEDDING_SRC_PATH,
      "embedding-sdk-bundle": SDK_BUNDLE_SRC_PATH,
      "sdk-iframe-embedding-script-ee-plugins": resolveEnterprisePathOrNoop(
        "/sdk-iframe-embedding-script-plugins",
      ),
    },
  },
};
