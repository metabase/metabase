/* eslint-disable no-undef */
import { execSync } from "child_process";
import fs from "fs";

import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { commonjs } from "@hyrious/esbuild-plugin-commonjs";
import { transform as svgrTransform } from "@svgr/core";
import { transform as esbuildTransform } from "esbuild";
import babel from "esbuild-plugin-babel";
import fixReactVirtualizedPlugin from "esbuild-plugin-react-virtualized";
import glob from "glob";
import { minimatch } from "minimatch";
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

const aliases = {
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
  "ee-plugins": path.join(ENTERPRISE_SRC_PATH, "sdk-plugins"),
  "ee-overrides": path.join(ENTERPRISE_SRC_PATH, "overrides"),
  "embedding-sdk": SDK_SRC_PATH,
};

const getCssModulesInjectCode = async () => {
  const code = `
    function mb_css(css, { insertAt } = {}) {
      if (!css || typeof document === 'undefined') return

      const head = document.head || document.getElementsByTagName('head')[0]
      const style = document.createElement('style')
      style.type = 'text/css'

      if (insertAt === 'top') {
        if (head.firstChild) {
          head.insertBefore(style, head.firstChild)
        } else {
          head.appendChild(style)
        }
      } else {
        head.appendChild(style)
      }

      if (style.styleSheet) {
        style.styleSheet.cssText = css
      } else {
        style.appendChild(document.createTextNode(css))
      }
    }
  `;

  return (
    await esbuildTransform(code, {
      minify: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      loader: "js",
    })
  ).code;
};

const setupBanners = async () => {
  const cssModulesInjectCode = await getCssModulesInjectCode();

  await glob("./**/*.{js,mjs,cjs}", { cwd: BUILD_PATH }, (err, files) => {
    files.forEach((file) => {
      const content = fs.readFileSync(path.join(BUILD_PATH, file), "utf8");
      const fileName = path.parse(file).name;

      // Right now all css modules are in the main bundle
      const isMainBundle = fileName === "index";
      const shouldAppendCssModulesInjectCode = isMainBundle;

      fs.writeFileSync(
        path.join(BUILD_PATH, file),
        `${LICENSE_BANNER}\n${shouldAppendCssModulesInjectCode ? `${cssModulesInjectCode}\n` : ""}${content}`,
      );
    });
  });
};

const getFullPathFromResolvePath = ({ resolveDir, resolvePath, aliases }) => {
  let fullPath;

  if (resolvePath.startsWith(".")) {
    fullPath = path.resolve(resolveDir, resolvePath);
  } else {
    const alias = Object.keys(aliases).find((alias) =>
      resolvePath.startsWith(`${alias}/`),
    );

    if (alias) {
      fullPath = path.resolve(
        path.join(aliases[alias], resolvePath.replace(alias, "")),
      );
    } else {
      fullPath = path.resolve(
        path.join(import.meta.dirname, "node_modules", resolvePath),
      );
    }
  }

  return fullPath;
};

// Taken from https://github.com/rtivital/hash-css-selector
// But generates hashes based on the full css module file path,
const generateScopedName = (selector, fileName) => {
  const prefix = "mb";
  const getFileName = (filePath) => {
    return filePath
      .replace(/\\/g, "/")
      .replace(".module", "")
      .replace(".css", "")
      .replace(".scss", "");
  };

  const hashCSSSelector = (selector) => {
    let hash = 0;

    for (let i = 0; i < selector.length; i += 1) {
      const chr = selector.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }

    return `${prefix}_${(hash + 2147483648).toString(16)}`;
  };

  return hashCSSSelector(`${getFileName(fileName)}-${selector}`, prefix);
};

const cssModulesPlugin = ({
  aliases = [],
  additionalCssModuleRegexp,
  resolve,
  generateScopedName,
}) => {
  const filter = new RegExp(
    `(${additionalCssModuleRegexp.source}$|\\.module\\.css$)`,
  );

  return {
    name: "css-modules",
    setup(build) {
      build.onResolve({ filter, namespace: "file" }, (args) => {
        const resolveDir = args.resolveDir;
        const resolvePath = args.path;

        const fullPath = getFullPathFromResolvePath({
          resolveDir,
          resolvePath,
          aliases,
        });

        return {
          path: `${fullPath}#css-module`,
          namespace: "css-module",
          pluginData: { fullPath },
        };
      });

      build.onLoad(
        { filter: /#css-module$/, namespace: "css-module" },
        async (args) => {
          const { fullPath } = args.pluginData;
          const source = await fs.promises.readFile(fullPath, "utf8");
          const json = {};
          const plugins = postcssConfig.plugins.filter(
            (p) => p.postcssPlugin !== "postcss-modules",
          );

          const result = await postcss([
            ...plugins,
            postCssModulesPlugin({
              generateScopedName: (name, filename) => {
                const s = generateScopedName(name, filename);
                json[name] = s;
                return s;
              },
              getJSON: () => {},
              resolve,
            }),
          ]).process(source, { from: fullPath });

          // The same logic as done in `tsup`, but for `css modules`
          const injectedCss = (
            await esbuildTransform(result.css, {
              minify: build.initialOptions.minify,
              minifyIdentifiers: build.initialOptions.minifyIdentifiers,
              minifySyntax: build.initialOptions.minifySyntax,
              minifyWhitespace: build.initialOptions.minifyWhitespace,
              logLevel: build.initialOptions.logLevel,
              loader: "css",
            })
          ).code;

          return {
            // `mb_css` is the function added by `setupBanners` function
            contents: `
              import "${fullPath}";
              export default ${JSON.stringify(json)};
              mb_css(${JSON.stringify(injectedCss)});
            `,
            pluginData: { css: result.css },
          };
        },
      );

      build.onResolve({ filter, namespace: "css-module" }, (args) => ({
        path: path.join(args.resolveDir, args.path) + "#css-module-data",
        namespace: "css-module",
        pluginData: args.pluginData,
      }));

      build.onLoad(
        { filter: /#css-module-data$/, namespace: "css-module" },
        (args) => ({
          contents: args.pluginData.css,
          loader: "css",
        }),
      );
    },
  };
};

// We have to use a custom plugin, because `esbuild-plugin-svgr` as a side-effect disables svg processing in `css` files
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
      async ({ path: importPath, resolvePath, pluginData }) => {
        const resolveDir = pluginData.resolveDir;
        const svgPath = importPath.replace(/\?component$/, "");

        const fullPath = getFullPathFromResolvePath({
          resolveDir,
          resolvePath: svgPath,
          aliases,
        });

        const source = await fs.promises.readFile(fullPath, "utf8");

        const contents = await svgrTransform(
          source,
          {
            plugins: ["@svgr/plugin-jsx"],
            ref: true,
          },
          {
            filePath: fullPath,
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

const sideEffectsPlugin = ({ sideEffects }) => ({
  name: "no-side-effects",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      const importer = args.importer;
      const relativeImporter = "./" + path.relative(process.cwd(), importer);

      if (args.pluginData) {
        return; // Ignore this if we called ourselves
      }

      const { path: argsPath, ...rest } = args;

      rest.pluginData = true; // Avoid infinite recursion

      const result = await build.resolve(argsPath, rest);

      const isSideEffectPath = sideEffects.some((sideEffectPath) =>
        minimatch(relativeImporter, sideEffectPath),
      );

      result.sideEffects = isSideEffectPath;

      return result;
    });

    build.onEnd((result) => {
      if (!result.warnings.length) {
        return;
      }

      const sideEffectWarnings = result.warnings.filter((warning) =>
        warning.text.includes("Ignoring this import because"),
      );

      if (!sideEffectWarnings.length) {
        return;
      }

      const errorMessage = sideEffectWarnings
        .map((warning) => {
          const {
            location: { file },
          } = warning;

          return `Found unregistered side-effect import in ${file}. Add it to the \`sideEffects\` array of the \`sideEffectsPlugin\` plugin.`;
        })
        .join("\n\n");

      throw new Error(errorMessage);
    });
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
  watch: isDevMode,
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
  esbuildPlugins: [
    cssModulesPlugin({
      aliases,
      additionalCssModuleRegexp: /css\/core\/index\.css/,
      resolve: (filePath) => {
        if (filePath === "style") {
          return path.resolve(SRC_PATH, "css/core/index.css");
        }

        return filePath;
      },
      generateScopedName,
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
    svgrPlugin(),
    sideEffectsPlugin({
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
    }),
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

    options.alias = aliases;

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

// Cleanup index.css file, styles are injected into .js file
fs.rmSync(path.join(BUILD_PATH, "index.css"));

await setupBanners();
