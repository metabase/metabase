/* eslint-env node */
/* eslint-disable import/no-commonjs */
/* eslint-disable import/order */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const esbuild = require("esbuild");
const {
  NodeModulesPolyfillPlugin,
} = require("@esbuild-plugins/node-modules-polyfill");

const SDK_SRC_PATH = __dirname + "/enterprise/frontend/src/embedding-sdk";
const BUILD_PATH = __dirname + "/resources/embedding-sdk";
const ENTERPRISE_SRC_PATH =
  __dirname + "/enterprise/frontend/src/metabase-enterprise";
const SRC_PATH = __dirname + "/frontend/src/metabase";
const LIB_SRC_PATH = __dirname + "/frontend/src/metabase-lib";
const TYPES_SRC_PATH = __dirname + "/frontend/src/metabase-types";
const ASSETS_PATH = __dirname + "/resources/frontend_client/app/assets";
const FONTS_PATH = __dirname + "/resources/frontend_client/app/fonts";
const CLJS_SRC_PATH = __dirname + "/target/cljs_release";
const CLJS_SRC_PATH_DEV = __dirname + "/target/cljs_dev";
const TEST_SUPPORT_PATH = __dirname + "/frontend/test/__support__";
const E2E_PATH = __dirname + "/e2e";
const { aliasPath } = require("esbuild-plugin-alias-path");
const postcss = require("postcss");
const loadConfig = require("postcss-load-config");

const skipDTS = process.env.SKIP_DTS === "true";

// default to development mode
const WEBPACK_BUNDLE = process.env.WEBPACK_BUNDLE || "development";
const isDevMode = WEBPACK_BUNDLE !== "production";

const sdkPackageTemplateJson = fs.readFileSync(
  path.resolve("./enterprise/frontend/src/embedding-sdk/package.template.json"),
  "utf-8",
);
const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);
const EMBEDDING_SDK_VERSION = sdkPackageTemplateJsonContent.version;

// Get git information
const GIT_BRANCH = execSync("git rev-parse --abbrev-ref HEAD")
  .toString()
  .trim();
const GIT_COMMIT = execSync("git rev-parse HEAD").toString().trim();

// Banner for the output files
const LICENSE_BANNER =
  "/*\n* This file is subject to the terms and conditions defined in\n * file 'LICENSE.txt', which is part of this source code package.\n */\n";

const postcssPluginSafe = {
  name: "postcss-safe",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      if (
        args.path.includes("node_modules") ||
        args.path.endsWith("vendor.css")
      ) {
        return;
      }

      const source = await fs.promises.readFile(args.path, "utf8");

      const { plugins, options } = await loadConfig(
        {},
        path.dirname(args.path),
      );

      const result = await postcss(plugins).process(source, {
        ...options,
        from: args.path,
      });

      return {
        contents: result.css,
        loader: "local-css",
      };
    });
  },
};

// Define plugins
const plugins = [
  aliasPath({
    // These aliases match the webpack configuration
    assets: ASSETS_PATH,
    fonts: FONTS_PATH,
    metabase: SRC_PATH,
    "metabase-lib": LIB_SRC_PATH,
    "metabase-enterprise": ENTERPRISE_SRC_PATH,
    "metabase-types": TYPES_SRC_PATH,
    "metabase-dev": `${SRC_PATH}/dev${isDevMode ? "" : "-noop"}.js`,
    cljs: isDevMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
    __support__: TEST_SUPPORT_PATH,
    e2e: E2E_PATH,
    style: SRC_PATH + "/css/core/index",
    icepick: __dirname + "/node_modules/icepick/icepick.min",
    "ee-plugins": ENTERPRISE_SRC_PATH + "/plugins",
    "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",
    "embedding-sdk": SDK_SRC_PATH,
    // Alias moment-timezone to trimmed 10-year-range build
    "moment-timezone":
      "moment-timezone/builds/moment-timezone-with-data-10-year-range.js",
    // Prevent raw JSON timezone data from being bundled (in webpack this was done with an alias to false)
    "moment-timezone/data/packed/latest.json": path.join(
      __dirname,
      "/dev/null",
    ),
  }),
  NodeModulesPolyfillPlugin(), // Equivalent to NodePolyfillPlugin in webpack
  {
    name: "process-polyfill",
    setup(build) {
      // Provide process.env variables
      build.onResolve({ filter: /^process$/ }, (args) => {
        return { path: args.path, namespace: "process-polyfill" };
      });

      build.onLoad({ filter: /.*/, namespace: "process-polyfill" }, () => {
        return {
          contents: `
            export default {
              browser: true,
              env: {
                EMBEDDING_SDK_VERSION: ${JSON.stringify(EMBEDDING_SDK_VERSION)},
                GIT_BRANCH: ${JSON.stringify(GIT_BRANCH)},
                GIT_COMMIT: ${JSON.stringify(GIT_COMMIT)},
                IS_EMBEDDING_SDK: true,
                BUILD_TIME: ${JSON.stringify(new Date().toISOString())},
                NODE_ENV: ${JSON.stringify(isDevMode ? "development" : "production")}
              }
            };
          `,
          loader: "js",
        };
      });
    },
  },

  postcssPluginSafe,

  {
    name: "svg-handler",
    setup(build) {
      // Handle SVG files with different resource queries similar to webpack
      build.onResolve({ filter: /\.svg\?component$/ }, (args) => {
        return {
          path: args.path,
          namespace: "svg-component",
          pluginData: { resolveDir: args.resolveDir },
        };
      });

      build.onResolve({ filter: /\.svg\?source$/ }, (args) => {
        return {
          path: args.path,
          namespace: "svg-source",
          pluginData: { resolveDir: args.resolveDir },
        };
      });

      build.onLoad(
        { filter: /.*/, namespace: "svg-component" },
        async (args) => {
          // This is a simplified version of @svgr/webpack functionality
          // In a real implementation, you might want to use a more sophisticated approach
          const resolveDir = args.pluginData.resolveDir;
          const svgPath = args.path.replace(/\?component$/, "");
          const realPath = path.isAbsolute(svgPath)
            ? svgPath
            : path.join(resolveDir, svgPath);

          try {
            const source = await fs.promises.readFile(realPath, "utf8");
            return {
              contents: `
              import React from 'react';
              export default function SvgComponent(props) {
                return React.createElement('svg', {
                  ...props,
                  dangerouslySetInnerHTML: { __html: ${JSON.stringify(source)} }
                });
              }
            `,
              loader: "jsx",
            };
          } catch (error) {
            return {
              errors: [{ text: `Failed to load SVG: ${error.message}` }],
            };
          }
        },
      );

      build.onLoad({ filter: /.*/, namespace: "svg-source" }, async (args) => {
        const resolveDir = args.pluginData.resolveDir;
        const svgPath = args.path.replace(/\?source$/, "");
        const realPath = path.isAbsolute(svgPath)
          ? svgPath
          : path.join(resolveDir, svgPath);

        try {
          const source = await fs.promises.readFile(realPath, "utf8");
          return {
            contents: `export default ${JSON.stringify(source)};`,
            loader: "js",
          };
        } catch (error) {
          return { errors: [{ text: `Failed to load SVG: ${error.message}` }] };
        }
      });
    },
  },
  {
    name: "banner-plugin",
    setup(build) {
      build.onEnd((result) => {
        if (result.outputFiles) {
          result.outputFiles.forEach((file) => {
            if (file.path.endsWith(".js")) {
              file.contents = Buffer.concat([
                Buffer.from(LICENSE_BANNER),
                file.contents,
              ]);
            }
          });
        }
      });
    },
  },
];

// Handle TypeScript type generation if not skipped
if (!skipDTS) {
  // Note: esbuild doesn't generate .d.ts files directly
  // In the webpack config, this was handled by ForkTsCheckerWebpackPlugin
  // We'll use the existing TypeScript compiler script from package.json
  console.log(
    "TypeScript declarations will be generated using 'embedding-sdk:tsc' script",
  );

  // This could be enhanced to run the TypeScript compiler directly:
  // const { spawnSync } = require('child_process');
  // spawnSync('yarn', ['embedding-sdk:tsc'], { stdio: 'inherit' });
}

// Main build configuration
const buildOptions = {
  entryPoints: [path.join(SDK_SRC_PATH, "index.ts")],
  bundle: true,
  outdir: path.join(BUILD_PATH, "dist"), // In webpack this was [name].bundle.js
  platform: "browser",
  target: "es2015",
  format: "esm", // CommonJS format (equivalent to library.type: "commonjs2")
  // In webpack, optimization was configured as:
  // optimization: {
  //   moduleIds: isDevMode ? "natural" : undefined,
  //   minimize: !isDevMode,
  //   minimizer: mainConfig.optimization.minimizer,
  //   usedExports: true,
  //   sideEffects: true,
  //   concatenateModules: true,
  // },
  sourcemap: isDevMode,
  minify: !isDevMode,
  metafile: true, // For bundle analysis
  treeShaking: true, // Equivalent to usedExports and sideEffects
  define: {
    "process.env.EMBEDDING_SDK_VERSION": JSON.stringify(EMBEDDING_SDK_VERSION),
    "process.env.GIT_BRANCH": JSON.stringify(GIT_BRANCH),
    "process.env.GIT_COMMIT": JSON.stringify(GIT_COMMIT),
    "process.env.IS_EMBEDDING_SDK": "true",
    "process.env.BUILD_TIME": JSON.stringify(new Date().toISOString()),
  },
  plugins,
  loader: {
    ".css": "css", // global CSS
    // In webpack, these were handled by various loaders:
    // - SVG: asset/inline, asset/source, @svgr/webpack
    // - PNG: asset/inline
    // - CSS: style-loader, css-loader, postcss-loader
    // esbuild has simpler built-in loaders
    ".svg": "dataurl", // Handle SVG files (equivalent to asset/inline)
    ".png": "dataurl", // Handle PNG files (equivalent to asset/inline)
    ".js": "jsx", // Handle JS files with JSX
    ".jsx": "jsx", // Handle JSX files
    ".ts": "ts", // Handle TS files with TSX
    ".tsx": "tsx", // Handle TSX files
  },
  jsx: "automatic", // Use React automatic JSX transform
  jsxImportSource: "@emotion/react",
  tsconfig: "./tsconfig.sdk.json",
  // CSS handling in esbuild is more limited than webpack
  // We can't fully replicate the CSS modules functionality of webpack
  // but we can provide some basic configuration through our custom CSS modules plugin
  // In webpack, externals were defined as:
  // externals: [
  //   mainConfig.externals,
  //   "react",
  //   /^react\//i,
  //   "react-dom",
  //   /^react-dom\//i,
  // ],
  external: [
    // Base externals from webpack.config.js
    "canvg",
    "dompurify",
    // Embedding SDK specific externals
    "react",
    "react-dom",
    "react/*",
    "react-dom/*",
  ],
  // In webpack, resolve was configured as:
  // resolve.extensions = [...mainConfig.resolve.extensions, ".mjs"];
  // resolve.mainFields = ["browser", "module", "main"];
  // resolve.alias = { ... }
  resolveExtensions: [
    ".tsx",
    ".ts",
    ".jsx",
    ".js",
    ".mjs",
    ".css",
    ".svg",
    ".png",
  ],
  mainFields: ["browser", "module", "main"],
  alias: {
    // These aliases match the webpack configuration
    assets: ASSETS_PATH,
    "~assets": ASSETS_PATH,
    fonts: FONTS_PATH,
    metabase: SRC_PATH,
    "metabase-lib": LIB_SRC_PATH,
    "metabase-enterprise": ENTERPRISE_SRC_PATH,
    "metabase-types": TYPES_SRC_PATH,
    "metabase-dev": `${SRC_PATH}/dev${isDevMode ? "" : "-noop"}.js`,
    cljs: isDevMode ? CLJS_SRC_PATH_DEV : CLJS_SRC_PATH,
    __support__: TEST_SUPPORT_PATH,
    e2e: E2E_PATH,
    style: SRC_PATH + "/css/core/index",
    icepick: __dirname + "/node_modules/icepick/icepick.min",
    "ee-plugins": ENTERPRISE_SRC_PATH + "/plugins",
    "ee-overrides": ENTERPRISE_SRC_PATH + "/overrides",
    "embedding-sdk": SDK_SRC_PATH,
    // Alias moment-timezone to trimmed 10-year-range build
    "moment-timezone":
      "moment-timezone/builds/moment-timezone-with-data-10-year-range.js",
    // Prevent raw JSON timezone data from being bundled (in webpack this was done with an alias to false)
    "moment-timezone/data/packed/latest.json": path.join(
      __dirname,
      "/dev/null",
    ),
  },
};

// Run the build
async function build() {
  try {
    console.log(
      `Building embedding SDK in ${isDevMode ? "development" : "production"} mode...`,
    );

    // If watching mode is enabled
    if (process.argv.includes("--watch")) {
      console.log("Starting watch mode...");
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log("Watching for changes...");
    } else {
      // Regular build
      const result = await esbuild.build(buildOptions);

      // Output build statistics
      if (process.env.SHOULD_ANALYZE_BUNDLES === "true") {
        fs.writeFileSync(
          path.join(BUILD_PATH, "meta.json"),
          JSON.stringify(result.metafile),
        );
        console.log("Bundle analysis written to meta.json");

        // In webpack, this would use BundleAnalyzerPlugin
        console.log(
          "To visualize the bundle, you can use esbuild-visualizer with the meta.json file",
        );
      }

      console.log(
        `Build complete! Output: ${path.join(BUILD_PATH, "dist/main.bundle.js")}`,
      );
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
