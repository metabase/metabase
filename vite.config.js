import { defineConfig } from "vite";
import path from "path";
import ViteRequireContext from "@originjs/vite-plugin-require-context";
import envCompatible from "vite-plugin-env-compatible";
import { injectHtml } from "vite-plugin-html";
import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

const resolve = pathStr => path.resolve(__dirname, pathStr);

const resolveFix = {
  name: "resolve-fixup",
  setup(build) {
    build.onResolve({ filter: /react-virtualized/ }, async args => {
      return {
        path: path.resolve(
          "./node_modules/react-virtualized/dist/umd/react-virtualized.js",
        ),
      };
    });
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  root: "frontend/src/",
  server: {
    port: "8080",
    strictPort: true,
    // proxy: {
    //   "/api": "http://localhost:3000",
    //   "/public": "http://localhost:3000",
    //   "/embed": "http://localhost:3000",
    //   "/question": "http://localhost:3000",
    // },
    fs: {
      allow: ["..", "../../enterprise"],
    },
  },
  esbuild: {
    // loader: "ts",
  },
  optimizeDeps: {
    // include: ["metabase"],
    esbuildOptions: {
      plugins: [resolveFix],
      loader: {
        ".js": "jsx",
      },
    },
  },
  publicDir: resolve("resources/frontend_client/"),
  resolve: {
    // dedupe: [
    //   "metabase",
    //   "metabase-lib",
    //   "metabase-types",
    //   "metabase-enterprise",
    // ],
    alias: [
      // {
      //   find: '@',
      //   replacement: path.resolve(__dirname,'src')
      // },
      // {
      //   find: /^((?:goog|labmdaisland)\.[\w\.]+(?!\?))(\?.*)/,
      //   // replacement: resolve("frontend/src/cljs") + "/$1",
      //   replacement: "cljs/$1.js",
      // },
      // {
      //   find: /(?:cljs\/)?((?:goog|labmdaisland)\.[\w\.^\?]+)/,
      //   // replacement: resolve("frontend/src/cljs") + "/$1",
      //   replacement: "cljs/$1",
      // },
      // {
      //   find: /(goog\.[\w\.]+)/,
      //   replacement: "/../cljs/$1",
      // },
      // {
      //   find: /^(goog\.[a-zA-Z\.]+)$/,
      //   replacement: "/cljs/cljs-runtime/$1.js",
      // },
      // {
      //   find: /^(goog\.[a-z\.]+)$/,
      //   replacement: "/cljs/$1",
      // },
      {
        find: "assets",
        replacement: resolve("resources/frontend_client/app/assets"),
      },
      {
        find: "fonts",
        replacement: resolve("resources/frontend_client/app/fonts"),
      },
      {
        find: "metabase-lib",
        replacement: resolve("frontend/src/metabase-lib"),
      },
      {
        find: "metabase-enterprise",
        replacement: resolve("enterprise/frontend/src/metabase-enterprise"),
      },
      {
        find: "metabase-types",
        replacement: resolve("frontend/src/metabase-types"),
      },
      {
        find: "cljs",
        replacement: resolve("node_modules/cljs"),
      },
      {
        find: "metabase/public",
        replacement: resolve("frontend/src/metabase/public"),
      },
      {
        find: "metabase",
        replacement: resolve("frontend/src/metabase"),
      },
      // {
      //   find: "__support__",
      //   replacement: resolve("frontend/test/__support__"),
      // },
      {
        find: "style",
        replacement: resolve("frontend/src/metabase/css/core/index"),
      },
      {
        find: "ace",
        replacement: resolve("node_modules/ace-builds/src-min-noconflict"),
      },
      // {
      //   find: "icepick",
      //   replacement: resolve("node_modules/icepick/icepick.min"),
      // },
      {
        find: "ee-plugins",
        replacement: resolve("frontend/src/metabase/lib/noop"),
      },
    ],
    extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json"],
  },
  plugins: [
    // ViteRequireContext({ projectBasePath: resolve("frontend/src/metabase") }),
    viteCommonjs({ include: ["metabase/lib/ace"] }),
    // viteCommonjs(),
    react(),
    // tsconfigPaths({ root: __dirname }),
    envCompatible(),
    injectHtml({
      data: {
        title: "Vite App",
      },
    }),
  ],
  mode: "development",
  build: {
    // commonjsOptions: {
    //   include: [/cljs/, /node_modules/],
    // },
    // commonjsOptions: {
    //   include: [/metabase/, /metabase-lib/, /metabase-types/, /node_modules/]
    // },
    rollupOptions: {
      // input: {
      //   "app-main": resolve("frontend/src/metabase/app-main.js"),
      //   "app-public": resolve("frontend/src/metabase/app-public.js"),
      //   "app-embed": resolve("frontend/src/metabase/app-embed.js"),
      //   styles: resolve("frontend/src/metabase/css/index.css"),
      // },
      // output: {
      //   entryFileNames: "[name].bundle.js?[chunkhash]",
      // },
    },
    // outDir: resolve("resources/frontend_client/app/dist"),
  },
  define: {},
});
