/* eslint-env node */
/* eslint-disable import/no-commonjs */
const rspack = require("@rspack/core");

const mainConfig = require("./rspack.main.config");
const { CSS_CONFIG } = require("./frontend/build/shared/rspack/css-config");

const ROOT = __dirname;
const ENTRY_PATH = ROOT + "/vscode-extension/scripts/notebook-entry.tsx";
const OUTPUT_PATH = ROOT + "/vscode-extension/vendor";

/** @type {import('@rspack/cli').Configuration} */
const config = {
  mode: "production",
  context: ROOT,
  devtool: false,

  entry: ENTRY_PATH,

  output: {
    path: OUTPUT_PATH,
    filename: "notebook-component.esm.js",
    library: { type: "module" },
    module: true,
    clean: false,
  },

  experiments: {
    outputModule: true,
  },

  resolve: {
    ...mainConfig.resolve,
    alias: {
      ...mainConfig.resolve.alias,
      "ee-plugins": ROOT + "/frontend/src/metabase/plugins/noop",
      "ee-overrides": ROOT + "/frontend/src/metabase/lib/noop",
      "sdk-ee-plugins": ROOT + "/frontend/src/metabase/plugins/noop",
      "embedding-sdk-shared": ROOT + "/frontend/src/embedding-sdk-shared",
    },
  },

  module: {
    rules: [
      {
        test: /\.(tsx?|jsx?)$/,
        exclude: /node_modules|cljs/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                loose: true,
                transform: {
                  react: { runtime: "automatic" },
                },
                parser: { syntax: "typescript", tsx: true },
                experimental: {
                  plugins: [["@swc/plugin-emotion", { sourceMap: false }]],
                },
              },
              minify: false,
              env: { targets: ["defaults"] },
            },
          },
        ],
        type: "javascript/auto",
      },
      {
        test: /\.css$/,
        use: [
          "style-loader",
          { loader: "css-loader", options: CSS_CONFIG },
          "postcss-loader",
        ],
        type: "javascript/auto",
      },
      {
        test: /\.(svg|png)$/,
        type: "asset/resource",
        resourceQuery: { not: [/component|source/] },
      },
      {
        test: /\.svg$/,
        type: "asset/source",
        resourceQuery: /source/,
      },
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        resourceQuery: /component/,
        use: [{ loader: "@svgr/webpack", options: { ref: true } }],
      },
      {
        test: /\.md$/,
        type: "asset/source",
      },
    ],
  },

  externals: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],

  optimization: {
    minimize: false,
  },

  plugins: [
    new rspack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.IS_EMBEDDING_SDK": JSON.stringify("false"),
    }),
    new rspack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
  ],
};

module.exports = config;
