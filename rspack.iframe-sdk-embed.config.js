/* eslint-disable import/no-commonjs */
/* eslint-disable no-undef */

const fs = require("fs");

const path = require("path");

const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

const SCRIPT_TAG_PATH = path.resolve(
  ENTERPRISE_SRC_PATH,
  "embedding_iframe_sdk/embed.ts",
);

const BUILD_PATH = __dirname + "/resources/frontend_client";

const OUT_FILE_NAME = "embed.js";
const OUT_TEMP_PATH = path.resolve(BUILD_PATH, "tmp-embed-js");

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
    {
      name: "copy-embed-js-to-app-path",
      apply(compiler) {
        compiler.hooks.afterEmit.tap("copy-embed-js-to-app-path", () => {
          const tempPath = path.join(OUT_TEMP_PATH, OUT_FILE_NAME);
          const appPath = path.join(BUILD_PATH, "app/", OUT_FILE_NAME);

          // copy embed.js from the temp directory to the resources directory
          fs.mkdirSync(path.dirname(appPath), { recursive: true });
          fs.copyFileSync(tempPath, appPath);

          // cleanup the temp directory to prevent bloat.
          fs.rmSync(OUT_TEMP_PATH, { recursive: true });
        });
      },
    },
  ],
};
