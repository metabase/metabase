import path from "path";

import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";
import { build, context } from "esbuild";
import babel from "esbuild-plugin-babel";

import { ALIAS } from "./frontend/build/embedding-sdk/constants/alias.mjs";
import { EXTERNALS } from "./frontend/build/embedding-sdk/constants/externals.mjs";
import {
  IS_DEV_MODE,
  MODE,
} from "./frontend/build/embedding-sdk/constants/is-dev-mode.mjs";
import { LICENSE_BANNER } from "./frontend/build/embedding-sdk/constants/license-banner.mjs";
import {
  BUILD_PATH,
  ROOT_PATH,
  SDK_SRC_PATH,
  SRC_PATH,
} from "./frontend/build/embedding-sdk/constants/paths.mjs";
import { RESOLVE_EXTENSIONS } from "./frontend/build/embedding-sdk/constants/resolve-extensions.mjs";
import { ENABLE_SOURCE_MAPS } from "./frontend/build/embedding-sdk/constants/source-maps-enabled.mjs";
import {
  EMBEDDING_SDK_VERSION,
  GIT_BRANCH,
  GIT_COMMIT,
} from "./frontend/build/embedding-sdk/constants/version-data.mjs";
import { cssModulesPlugin } from "./frontend/build/embedding-sdk/plugins/css-modules-plugin.mjs";
import { dynamicLocaleImportsPlugin } from "./frontend/build/embedding-sdk/plugins/dynamic-locale-imports-plugin.mjs";
import { externalPlugin } from "./frontend/build/embedding-sdk/plugins/external-plugin.mjs";
import { postcssPlugin } from "./frontend/build/embedding-sdk/plugins/postcss-plugin.mjs";
import { sideEffectsPlugin } from "./frontend/build/embedding-sdk/plugins/side-effects-plugin.mjs";
import { svgPlugin } from "./frontend/build/embedding-sdk/plugins/svg-plugin.mjs";
import { generateScopedCssClassName } from "./frontend/build/embedding-sdk/utils/generate-scoped-css-class-name.mjs";
import { postBuildCleanup } from "./frontend/build/embedding-sdk/utils/post-build-cleanup.mjs";
import { preBuildCleanup } from "./frontend/build/embedding-sdk/utils/pre-build-cleanup.mjs";
import { printBold } from "./frontend/build/embedding-sdk/utils/print-bold.mjs";
import { removeRequireCall } from "./frontend/build/embedding-sdk/utils/remove-require-call.mjs";

printBold(`Building SDK with options:
  - MODE                : ${MODE}
  - ENABLE_SOURCE_MAPS  : ${ENABLE_SOURCE_MAPS}
`);

async function esbuildRun(format) {
  const esbuildBuild = !IS_DEV_MODE ? build : context;
  const esbuildContext = await esbuildBuild({
    entryPoints: [path.join(SDK_SRC_PATH, "index.ts")],
    outdir: BUILD_PATH,
    outExtension: { ".js": format === "esm" ? ".js" : ".cjs" },
    bundle: true,
    platform: "browser",
    target: "esnext",
    format,
    splitting: format === "esm" && !IS_DEV_MODE,
    treeShaking: !IS_DEV_MODE,
    sourcemap: ENABLE_SOURCE_MAPS ? "external" : false,
    minify: !IS_DEV_MODE,
    metafile: false,
    resolveExtensions: RESOLVE_EXTENSIONS,
    mainFields: ["browser", "module", "main"],
    alias: ALIAS,
    banner: {
      js: LICENSE_BANNER,
    },
    define: {
      define: '"undefined"',
      "process.env.BUILD_TIME": `\"${new Date().toISOString()}\"`,
      "process.env.EMBEDDING_SDK_VERSION": JSON.stringify(
        EMBEDDING_SDK_VERSION,
      ),
      "process.env.GIT_BRANCH": JSON.stringify(GIT_BRANCH),
      "process.env.GIT_COMMIT": JSON.stringify(GIT_COMMIT),
      "process.env.IS_EMBEDDING_SDK": "true",
      "process.env.MB_LOG_ANALYTICS": "false",
      "process.env.MB_LOG_CHARTS_DEBUG": "false",
      "process.env.STORYBOOK": "false",
      "process.env.NODE_ENV": '"production"',
      "process.env.WEBPACK_BUNDLE": '"development"',
      "process.env.BUNDLE_FORMAT": `"${format}"`,
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
    jsx: "automatic",
    logLevel: "info",
    plugins: [
      externalPlugin(),
      postcssPlugin(),
      cssModulesPlugin({
        additionalCssModuleRegexps: [/css\/core\/index\.css/],
        resolve(filePath) {
          return filePath === "style"
            ? path.resolve(SRC_PATH, "css/core/index.css")
            : filePath;
        },
        generateScopedName: generateScopedCssClassName,
      }),
      babel({
        filter: /\.styled\.[jt]s?x/,
        config: {
          sourceMaps: ENABLE_SOURCE_MAPS,
          presets: [["@babel/preset-env", { bugfixes: true, modules: false }]],
        },
      }),
      dynamicLocaleImportsPlugin({
        basePath: ROOT_PATH,
        filter: /embedding-sdk\/lib\/i18n\/.*$/,
        libraryLocalePaths: [
          "moment/dist/locale",
          "moment/locale",
          "dayjs/locale",
        ],
      }),
      commonjs({ ignore: (id) => !EXTERNALS.includes(id) }),
      NodeModulesPolyfillPlugin(),
      svgPlugin(),
      !IS_DEV_MODE &&
        sideEffectsPlugin({
          basePath: ROOT_PATH,
          sideEffects: [
            "./enterprise/frontend/src/metabase-enterprise/**",
            "./enterprise/frontend/src/embedding-sdk/index.ts",
            "./enterprise/frontend/src/embedding-sdk/lib/sdk-specific-imports.ts",
            "./enterprise/frontend/src/embedding-sdk/components/public/MetabaseProvider.tsx",
            "./frontend/src/metabase/visualizations/components/LeafletChoropleth.jsx",
            "./frontend/src/metabase/visualizations/components/LeafletHeatMap.jsx",
            "./frontend/src/metabase/visualizations/components/LeafletMap.jsx",
            "./frontend/src/metabase/dashboard/components/grid/GridLayout.tsx",
          ],
        }),
    ].filter(Boolean),
  });

  if (IS_DEV_MODE) {
    await esbuildContext.watch();
  }
}

(async () => {
  preBuildCleanup({ buildPath: BUILD_PATH });

  try {
    await Promise.all(
      [esbuildRun("esm"), !IS_DEV_MODE ? esbuildRun("cjs") : null].filter(
        Boolean,
      ),
    );

    printBold("Running additional transformations...");

    await removeRequireCall({ buildPath: BUILD_PATH });

    printBold("Build complete!");
  } catch (error) {
    console.error("Build failed:", error);
  }

  postBuildCleanup({ buildPath: BUILD_PATH });
})();
