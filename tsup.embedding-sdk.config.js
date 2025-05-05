import { execSync } from "child_process";
import fs from "fs";

import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";
import { transform } from "@svgr/core";
import babel from "esbuild-plugin-babel";
import fixReactVirtualized from "esbuild-plugin-react-virtualized";
import { createGenerateScopedName } from "hash-css-selector";
import path from "path";
import postcss from "postcss";
import postCssModulesPlugin from "postcss-modules";
import { build } from "tsup";

import postcssConfig from "./postcss.config.js";

const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const isDevMode = WEBPACK_BUNDLE !== "production";

const SDK_SRC_PATH = path.resolve(
  import.meta.dirname,
  "enterprise/frontend/src/embedding-sdk",
);
const BUILD_PATH = path.resolve(
  import.meta.dirname,
  "resources/embedding-sdk",
  "dist",
);

const ENTERPRISE_SRC_PATH = path.resolve(
  import.meta.dirname,
  "enterprise/frontend/src/metabase-enterprise",
);
const SRC_PATH = path.resolve(import.meta.dirname, "frontend/src/metabase");
const LIB_SRC_PATH = path.resolve(
  import.meta.dirname,
  "frontend/src/metabase-lib",
);
const TYPES_SRC_PATH = path.resolve(
  import.meta.dirname,
  "frontend/src/metabase-types",
);
const ASSETS_PATH = path.resolve(
  import.meta.dirname,
  "resources/frontend_client/app/assets",
);
const FONTS_PATH = path.resolve(
  import.meta.dirname,
  "resources/frontend_client/app/fonts",
);
const CLJS_SRC_PATH_DEV = path.resolve(import.meta.dirname, "target/cljs_dev");
const CLJS_SRC_PATH = path.resolve(import.meta.dirname, "target/cljs_release");
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

const LICENSE_BANNER = `/*
* This file is subject to the terms and conditions defined in
 * file 'LICENSE.txt', which is part of this source code package.
 */\n`;

const processPolyfillPlugin = () => ({
  name: "process-polyfill",
  setup(build) {
    build.onResolve({ filter: /^process$/ }, () => ({
      path: "process",
      namespace: "process-polyfill",
    }));
    build.onLoad({ filter: /.*/, namespace: "process-polyfill" }, () => ({
      contents: `export default { browser: true, env: { EMBEDDING_SDK_VERSION: ${JSON.stringify(
        EMBEDDING_SDK_VERSION,
      )}, GIT_BRANCH: ${JSON.stringify(GIT_BRANCH)}, GIT_COMMIT: ${JSON.stringify(
        GIT_COMMIT,
      )}, IS_EMBEDDING_SDK: true, BUILD_TIME: ${JSON.stringify(
        new Date().toISOString(),
      )}, NODE_ENV: ${JSON.stringify(isDevMode ? "development" : "production")} } };`,
      loader: "js",
    }));
  },
});

const cssModulesPlugin = () => ({
  name: "css-module",
  setup(build) {
    const generateScopedName = createGenerateScopedName("mb-sdk");

    build.onResolve(
      {
        filter: /(index\.css|\.module\.css)$/,
        namespace: "file",
      },
      (args) => {
        let pathDir = "";

        if (args.path.startsWith(".")) {
          pathDir = path.resolve(args.resolveDir, args.path);
        } else if (args.path.startsWith("metabase")) {
          pathDir = path.resolve(
            path.join(SRC_PATH, args.path.replace("metabase", "")),
          );
        } else {
          pathDir = path.resolve(
            path.join(import.meta.dirname, "node_modules", args.path),
          );
        }

        return {
          path: `${args.path}#css-module`,
          namespace: "css-module",
          pluginData: {
            pathDir,
          },
        };
      },
    );

    build.onLoad(
      { filter: /#css-module$/, namespace: "css-module" },
      async (args) => {
        const { pluginData } = args;

        const source = await fs.promises.readFile(pluginData.pathDir, "utf8");

        const cssModule = {};

        const filteredPlugins = postcssConfig.plugins.filter(
          (pluginData) => pluginData.postcssPlugin !== "postcss-modules",
        );

        const result = await postcss([
          ...filteredPlugins,
          postCssModulesPlugin({
            generateScopedName(name, filename) {
              const newSelector = generateScopedName(name, filename);

              cssModule[name] = newSelector;

              return newSelector;
            },
            getJSON() {},
            resolve(filePath) {
              if (filePath === "style") {
                return path.resolve(SRC_PATH, "css/core/index.css");
              }

              return filePath;
            },
          }),
        ]).process(source, {
          from: pluginData.pathDir,
        });

        return {
          pluginData: { css: result.css },
          contents: `import "${
            pluginData.pathDir
          }"; export default ${JSON.stringify(cssModule)}`,
        };
      },
    );

    build.onResolve(
      {
        filter: /(index\.css|\.module\.css)$/,
        namespace: "css-module",
      },
      (args) => {
        return {
          path: path.join(args.resolveDir, args.path, "#css-module-data"),
          namespace: "css-module",
          pluginData: args.pluginData,
        };
      },
    );

    build.onLoad(
      { filter: /#css-module-data$/, namespace: "css-module" },
      (args) => {
        return {
          contents: args.pluginData?.css ?? "",
          loader: "css",
        };
      },
    );
  },
});

// We have to use a custom plugin, because `esbuild-plugin-svgr` as a side-effect disables svg processing in `css` files
// TODO: try to use a custom plugin but with svgr package.
// Testing: check that svg in .css files are base64
const svgrPlugin = () => ({
  name: "svgr-plugin",
  setup(build) {
    build.onResolve({ filter: /\.svg\?component$/ }, (args) => ({
      path: args.path,
      namespace: "svg-component",
      pluginData: args,
    }));

    build.onResolve({ filter: /\.svg\?source$/ }, (args) => ({
      path: args.path,
      namespace: "svg-source",
      pluginData: args,
    }));

    build.onLoad(
      { filter: /.*/, namespace: "svg-component" },
      async ({ path: importPath, pluginData }) => {
        const resolveDir = pluginData.resolveDir;
        const svgPath = importPath.replace(/\?component$/, "");
        const realPath = path.isAbsolute(svgPath)
          ? svgPath
          : path.join(resolveDir, svgPath);
        const source = await fs.promises.readFile(realPath, "utf8");

        const contents = await transform(
          source,
          {
            plugins: ["@svgr/plugin-jsx"],
            ref: true,
          },
          {
            filePath: realPath,
          },
        );

        return {
          contents,
          loader: "jsx",
        };
      },
    );

    build.onLoad(
      { filter: /.*/, namespace: "svg-source" },
      async ({ path: importPath, pluginData }) => {
        const resolveDir = pluginData.resolveDir;
        const svgPath = importPath.replace(/\?source$/, "");
        const realPath = path.isAbsolute(svgPath)
          ? svgPath
          : path.join(resolveDir, svgPath);
        const source = await fs.promises.readFile(realPath, "utf8");
        return {
          contents: `export default ${JSON.stringify(source)};`,
          loader: "js",
        };
      },
    );
  },
});

await build({
  entry: [path.join(SDK_SRC_PATH, "index.ts")],
  outDir: BUILD_PATH,
  bundle: true,
  tsconfig: "./tsconfig.sdk.json",
  platform: "browser",
  target: "esnext",
  format: "esm",
  shims: true,
  splitting: true,
  treeshake: true,
  sourcemap: isDevMode,
  minify: !isDevMode,
  clean: true,
  metafile: false,
  // We have to generate `dts` via `tsc` to emit files on `dts` type errors
  dts: false,
  noExternal: [
    /^(?!(?:canvg(?:\/|$)|dompurify(?:\/|$)|react(?:\/|$)|react-dom(?:\/|$))).*/,
  ],
  banner: {
    js: LICENSE_BANNER,
    css: LICENSE_BANNER,
  },
  define: {
    "process.env.EMBEDDING_SDK_VERSION": JSON.stringify(EMBEDDING_SDK_VERSION),
    "process.env.GIT_BRANCH": JSON.stringify(GIT_BRANCH),
    "process.env.GIT_COMMIT": JSON.stringify(GIT_COMMIT),
    "process.env.IS_EMBEDDING_SDK": "true",
    "process.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
    // To completely disable the AMD parsing by a HostApp's bundler for 3rd parties.
    // AMD parser in Webpack produces incorrect code.
    define: '"undefined"',
  },
  esbuildPlugins: [
    cssModulesPlugin(),
    fixReactVirtualized,
    // To properly apply @emotion plugin before `requireToImport`
    babel({ filter: /\.[jt]s?x/ }),
    commonjs({
      filter: /node_modules\/.*\.(?:js|cjs)$/,
      ignore: (path) => !(path === "react" || path === "react-dom"),
    }),
    NodeModulesPolyfillPlugin(),
    processPolyfillPlugin(),
    svgrPlugin(),
  ],
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
      style: path.join(SRC_PATH, "css/core/index"),
      icepick: path.resolve(
        import.meta.dirname,
        "node_modules/icepick/icepick.min",
      ),
      "ee-plugins": path.join(ENTERPRISE_SRC_PATH, "plugins"),
      "ee-overrides": path.join(ENTERPRISE_SRC_PATH, "overrides"),
      "embedding-sdk": SDK_SRC_PATH,
      "moment-timezone":
        "moment-timezone/builds/moment-timezone-with-data-10-year-range.js",
      "moment-timezone/data/packed/latest.json": path.join(
        import.meta.dirname,
        "dev/null",
      ),
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
});
