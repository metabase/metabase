import { build } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

await build({
  entryPoints: [resolve(__dirname, "metabase-lib-entry.ts")],
  bundle: true,
  format: "esm",
  outfile: resolve(__dirname, "../vendor/metabase-lib.esm.js"),
  platform: "browser",
  target: "es2020",
  minify: false,
  sourcemap: true,

  alias: {
    cljs: resolve(root, "target/cljs_release"),
    "metabase-lib": resolve(root, "frontend/src/metabase-lib"),
    "metabase-types": resolve(root, "frontend/src/metabase-types"),
    metabase: resolve(root, "frontend/src/metabase"),
  },

  // The CLJS code uses `var window = global;` — provide a shim
  define: {
    global: "globalThis",
  },

  // Externalize packages we don't want to bundle
  external: ["react", "react-dom"],

  // Handle CommonJS CLJS modules
  mainFields: ["module", "main"],

  logLevel: "info",
});

console.log("metabase-lib bundled successfully");
