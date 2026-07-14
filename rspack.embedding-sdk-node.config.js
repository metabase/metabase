// @ts-check
/* eslint-disable no-undef */
// Node-targeted builds for the SDK package: the `npx` CLI and the data-app dev
// preset (`@metabase/embedding-sdk-react/data-app-dev/config`). Both run
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
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
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
    "metabase-enterprise": ENTERPRISE_SRC_PATH,
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

// ESM-only: this entry is imported from a Vite config (`import { dataAppConfig }
// from "@metabase/embedding-sdk-react/data-app-dev/config"`), which Vite loads
// through the ESM `import` condition. ESM-only lets the dev plugin read its
// sibling dev-entry bundle via `import.meta.url` natively (no `__dirname` shim
// needed). The browser subpath (`/data-app-dev`) is built from `data-app-dev.ts`
// by rspack.embedding-sdk-package.config.js.
/** @type {import('@rspack/cli').Configuration} */
const dataAppDevConfig = {
  mode: "production",
  entry: `${SDK_PACKAGE_SRC_PATH}/data-app-dev.config.ts`,
  target: "node",
  context: SDK_PACKAGE_SRC_PATH,
  // The consumer's app provides the Vite toolchain (the same Vite instance runs
  // the config), so leave it all external. Bundling the plugins — `vite-plugin-svgr`
  // especially — would pull in @svgr/core + Babel + TypeScript + browserslist,
  // which is heavy and floods the build with dynamic-`require` warnings.
  externals: [
    "vite",
    "@vitejs/plugin-react",
    "vite-plugin-svgr",
    "vite-plugin-css-injected-by-js",
  ],
  externalsType: "module",
  output: {
    path: SDK_DIST_PATH,
    filename: "data-app-dev.config.js",
    library: { type: "module" },
  },
  experiments: { outputModule: true },
  resolve: sharedResolve,
  // Leave `new URL(..., import.meta.url)` fully as runtime code: `url: false` stops
  // it being treated as a build-time asset, and `importMeta: false` stops rspack
  // baking `import.meta.url` to the source path — so at runtime it's the emitted
  // bundle's URL and the dev plugin resolves its sibling dev-entry in `dist`.
  module: {
    ...sharedModule,
    parser: { javascript: { url: false, importMeta: false } },
  },
  optimization: { minimize: true, minimizer },
};

module.exports = [cliConfig, dataAppDevConfig];
