/* eslint-disable no-undef */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";
import babel from "esbuild-plugin-babel";
import fixReactVirtualizedPlugin from "esbuild-plugin-react-virtualized";
import { build } from "tsup";

import { LICENSE_BANNER } from "./frontend/build/embedding-sdk/constants/license-banner.mjs";
import { cssModulesPlugin } from "./frontend/build/embedding-sdk/plugins/css-modules-plugin.mjs";
import { sideEffectsPlugin } from "./frontend/build/embedding-sdk/plugins/side-effects-plugin.mjs";
import { svgPlugin } from "./frontend/build/embedding-sdk/plugins/svg-plugin.mjs";
import { generateScopedCssClassName } from "./frontend/build/embedding-sdk/utils/generate-scoped-css-class-name.mjs";
import { getCssModulesInjectCode } from "./frontend/build/embedding-sdk/utils/get-css-modules-inject-code.mjs";
import { getFullPathFromResolvePath } from "./frontend/build/embedding-sdk/utils/get-full-path-from-resolve-path.mjs";
import { setupBanners } from "./frontend/build/embedding-sdk/utils/setup-banners.mjs";

const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const isDevMode = WEBPACK_BUNDLE !== "production";

const SRC_PATH = path.resolve(import.meta.dirname, "frontend/src/metabase");
const SDK_SRC_PATH = path.resolve(
  import.meta.dirname,
  "enterprise/frontend/src/embedding-sdk",
);
const ENTERPRISE_SRC_PATH = path.resolve(
  import.meta.dirname,
  "enterprise/frontend/src/metabase-enterprise",
);
const LIB_SRC_PATH = path.resolve(
  import.meta.dirname,
  "frontend/src/metabase-lib",
);
const TYPES_SRC_PATH = path.resolve(
  import.meta.dirname,
  "frontend/src/metabase-types",
);
const ROOT_CSS_FILE_PATH = path.join(SRC_PATH, "css/core/index");

const CLJS_SRC_PATH_DEV = path.resolve(import.meta.dirname, "target/cljs_dev");
const CLJS_SRC_PATH = path.resolve(import.meta.dirname, "target/cljs_release");

const BUILD_PATH = path.resolve(
  import.meta.dirname,
  "resources/embedding-sdk",
  "dist",
);

const ASSETS_PATH = path.resolve(
  import.meta.dirname,
  "resources/frontend_client/app/assets",
);
const FONTS_PATH = path.resolve(
  import.meta.dirname,
  "resources/frontend_client/app/fonts",
);

const TEST_SUPPORT_PATH = path.resolve(
  import.meta.dirname,
  "frontend/test/__support__",
);
const E2E_PATH = path.resolve(import.meta.dirname, "e2e");

const pkgTpl = fs.readFileSync(
  path.resolve(SDK_SRC_PATH, "package.template.json"),
  "utf-8",
);
const EMBEDDING_SDK_VERSION = JSON.parse(pkgTpl).version;
const GIT_BRANCH = execSync("git rev-parse --abbrev-ref HEAD")
  .toString()
  .trim();
const GIT_COMMIT = execSync("git rev-parse HEAD").toString().trim();

await build({
  entry: [path.join(SDK_SRC_PATH, "index.ts")],
  outDir: BUILD_PATH,
  bundle: true,
  tsconfig: "./tsconfig.sdk.json",
  platform: "browser",
  target: "esnext",
  format: "esm",
  shims: true,
  splitting: !isDevMode,
  treeshake: !isDevMode,
  sourcemap: false,
  minify: !isDevMode,
  clean: !isDevMode,
  watch: isDevMode
    ? ["./enterprise/frontend/src/embedding-sdk", "./frontend/src"]
    : false,
  metafile: false,
  // We have to generate `dts` via `tsc` to emit files on `dts` type errors
  dts: false,
  noExternal: [
    /^(?!(?:canvg(?:\/|$)|dompurify(?:\/|$)|react(?:\/|$)|react-dom(?:\/|$))).*/,
  ],
  injectStyle: true,
  env: {
    BUILD_TIME: JSON.stringify(new Date().toISOString()),
    EMBEDDING_SDK_VERSION: JSON.stringify(EMBEDDING_SDK_VERSION),
    GIT_BRANCH: JSON.stringify(GIT_BRANCH),
    GIT_COMMIT: JSON.stringify(GIT_COMMIT),
    IS_EMBEDDING_SDK: "true",
    MB_LOG_ANALYTICS: "false",
    MB_LOG_CHARTS_DEBUG: "false",
    STORYBOOK: "false",
    WEBPACK_BUNDLE: "development", // this is weird, but it is how it is done in the rspack config
  },
  define: {
    // To completely disable the AMD parsing by a HostApp's bundler for 3rd parties.
    // AMD parser in Webpack produces incorrect code.
    define: '"undefined"',
  },
  loader: {
    ".css": "css",
    ".svg": "dataurl",
    ".png": "dataurl",
    ".js": "jsx",
    ".jsx": "jsx",
    ".ts": "ts",
    ".tsx": "tsx",
  },
  esbuildOptions: (options) => {
    options.outbase = SDK_SRC_PATH;

    options.alias = {
      assets: ASSETS_PATH,
      "~assets": ASSETS_PATH,
      fonts: FONTS_PATH,
      metabase: SRC_PATH,
      "metabase-lib": LIB_SRC_PATH,
      "metabase-enterprise": ENTERPRISE_SRC_PATH,
      "metabase-types": TYPES_SRC_PATH,
      "metabase-dev": path.join(SRC_PATH, `dev${isDevMode ? "" : "-noop"}.js`),
      cljs: isDevMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
      __support__: TEST_SUPPORT_PATH,
      e2e: E2E_PATH,
      style: ROOT_CSS_FILE_PATH,
      icepick: path.resolve(
        import.meta.dirname,
        "node_modules/icepick/icepick.min",
      ),
      "sdk-ee-plugins": path.join(ENTERPRISE_SRC_PATH, "sdk-plugins"),
      "ee-overrides": path.join(ENTERPRISE_SRC_PATH, "overrides"),
      "embedding-sdk": SDK_SRC_PATH,
    };

    options.resolveExtensions = [
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".mjs",
      ".css",
      ".svg",
      ".png",
    ];

    options.mainFields = ["browser", "module", "main"];

    return options;
  },
  esbuildPlugins: [
    cssModulesPlugin({
      additionalCssModuleRegexp: /css\/core\/index\.css/,
      resolve: (filePath) => {
        if (filePath === "style") {
          return path.resolve(SRC_PATH, "css/core/index.css");
        }

        return filePath;
      },
      getFullPathFromResolvePath,
      generateScopedName: generateScopedCssClassName,
    }),
    fixReactVirtualizedPlugin,
    // To properly apply @emotion plugin before `requireToImport`
    babel({
      filter: /\.[jt]s?x/,
      config: {
        // The options below extend `babel.config.json`
        presets: [
          [
            "@babel/preset-env",
            {
              bugfixes: true,
              modules: false,
            },
          ],
        ],
      },
    }),
    commonjs({
      filter: /node_modules\/.*\.(?:js|cjs)$/,
      ignore: (path) => !(path === "react" || path === "react-dom"),
    }),
    NodeModulesPolyfillPlugin(),
    svgPlugin({ getFullPathFromResolvePath }),
    !isDevMode
      ? // This plugin is heavy, so we don't apply it for dev mode
        sideEffectsPlugin({
          cwd: process.cwd(),
          sideEffects: [
            "**/*.css",
            "./enterprise/frontend/src/metabase-enterprise/**",
            "./enterprise/frontend/src/embedding-sdk/index.ts",
            // eslint-disable-next-line no-literal-metabase-strings -- build config
            "./enterprise/frontend/src/embedding-sdk/components/public/MetabaseProvider.tsx",
            "./frontend/src/metabase/visualizations/components/LeafletChoropleth.jsx",
            "./frontend/src/metabase/visualizations/components/LeafletHeatMap.jsx",
            "./frontend/src/metabase/visualizations/components/LeafletMap.jsx",
            "./frontend/src/metabase/dashboard/components/grid/GridLayout.tsx",
            "./e2e/**/**",
          ],
        })
      : null,
  ],
  onSuccess: async () => {
    // Cleanup index.css file, styles are injected into .js file
    fs.rmSync(path.join(BUILD_PATH, "index.css"));

    const cssModulesInjectCode = await getCssModulesInjectCode();
    await setupBanners({
      buildPath: BUILD_PATH,
      getBanners: () => {
        return [LICENSE_BANNER, cssModulesInjectCode];
      },
    });
  },
});
