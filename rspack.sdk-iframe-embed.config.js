const BUILD_PATH = __dirname + "/resources/frontend_client";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";

module.exports = {
  name: 'iframe_sdk_embed_v1',
  entry: ENTERPRISE_SRC_PATH + "/embedding_iframe_sdk/embed.v1.ts",
  output: {
    path: BUILD_PATH + "/app",
    filename: 'embed.v1.js',
    library: 'metabase.embed',
    libraryTarget: 'umd',
    globalObject: 'this',

    // disabling HMR with devServer.hot still results in hot update files,
    // so we must disable them explicitly
    hotUpdateChunkFilename: "",
    hotUpdateMainFilename: "",
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
              jsc: { loose: true, transform: {}, parser: { syntax: "typescript" }, },
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
}
