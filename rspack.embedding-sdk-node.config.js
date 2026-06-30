// @ts-check
/* eslint-disable no-undef */
// Node-targeted builds for the SDK package: the `npx` CLI and the data-app dev
// server preset (`@metabase/embedding-sdk-react/data-app-dev/server`). Both run
// in Node (not the browser), so they can't go through the browser rspack bundle.
const path = require("path");

const rspack = require("@rspack/core");

const SDK_DIST_PATH = path.join(__dirname, "/resources/embedding-sdk/dist");
const SDK_PACKAGE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/embedding-sdk-package";
const SDK_BUNDLE_SRC_PATH = __dirname + "/frontend/src/embedding-sdk-bundle";
const SDK_CLI_PATH = path.join(SDK_PACKAGE_SRC_PATH, "cli");

const METABASE_SRC_PATH = path.join(__dirname, "/frontend/src/metabase");
const TYPES_SRC_PATH = path.join(__dirname, "/frontend/src/metabase-types");
const BUILD_CONFIGS_PATH = path.join(__dirname, "/frontend/build");

const BABEL_CONFIG = {
  cacheDirectory: process.env.BABEL_DISABLE_CACHE ? false : ".babel_cache",
};

const sharedResolve = {
  extensions: [".ts", ".js"],
  alias: {
    metabase: METABASE_SRC_PATH,
    "metabase-types": TYPES_SRC_PATH,
    "embedding-sdk-package": SDK_PACKAGE_SRC_PATH,
    "embedding-sdk-bundle": SDK_BUNDLE_SRC_PATH,
    "build-configs": BUILD_CONFIGS_PATH,
  },
};

const sharedModule = {
  rules: [
    {
      test: /\.(tsx?|js)$/,
      exclude: /node_modules/,
      use: [{ loader: "babel-loader", options: BABEL_CONFIG }],
    },
  ],
};

const minimizer = [
  new rspack.SwcJsMinimizerRspackPlugin({
    minimizerOptions: { format: { comments: false } },
    extractComments: false,
  }),
];

/** @type {import('@rspack/cli').Configuration} */
const cliConfig = {
  mode: "production",
  entry: `${SDK_CLI_PATH}/cli.ts`,
  target: "node",
  context: SDK_CLI_PATH,
  output: {
    path: SDK_DIST_PATH,
    filename: "cli.js",
    library: { type: "commonjs2" },
  },
  resolve: sharedResolve,
  module: sharedModule,
  plugins: [
    new rspack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
  ],
  optimization: { minimize: true, minimizer },
};

// The consumer brings its own `vite` + React Vite plugin (the same instance that
// runs the config), so both are left external rather than bundled.
const SERVER_ENTRY = `${SDK_PACKAGE_SRC_PATH}/data-app-dev.ts`;
const SERVER_EXTERNALS = ["vite", "@vitejs/plugin-react"];

/** @type {import('@rspack/cli').Configuration} */
const serverConfig = {
  mode: "production",
  entry: SERVER_ENTRY,
  target: "node",
  context: SDK_PACKAGE_SRC_PATH,
  externals: SERVER_EXTERNALS,
  // Keep the real Node `__dirname` at runtime so the dev plugin can read the
  // dev entry source it ships next to this bundle in `dist`.
  node: { __dirname: false, __filename: false },
  output: {
    path: SDK_DIST_PATH,
    filename: "data-app-dev.bundle.js",
    library: { type: "commonjs2" },
  },
  resolve: sharedResolve,
  module: sharedModule,
  optimization: { minimize: true, minimizer },
};

/** @type {import('@rspack/cli').Configuration} */
const serverEsmConfig = {
  ...serverConfig,
  externalsType: "module",
  output: {
    path: SDK_DIST_PATH,
    filename: "data-app-dev.esm.js",
    library: { type: "module" },
  },
  experiments: { outputModule: true },
  // ESM has no `__dirname`; the dev plugin needs it to read the dev entry it ships
  // in `dist`. Shim it from `import.meta.url` at the top of the bundle.
  plugins: [
    new rspack.BannerPlugin({
      raw: true,
      banner: [
        'import { fileURLToPath as __mbToPath } from "node:url";',
        "const __filename = __mbToPath(import.meta.url);",
        'const __dirname = __mbToPath(new URL(".", import.meta.url));',
      ].join("\n"),
    }),
  ],
};

module.exports = [cliConfig, serverConfig, serverEsmConfig];
