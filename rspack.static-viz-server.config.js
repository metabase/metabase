// Builds the standalone static-viz HTTP service (frontend/src/static-viz-server/app.ts) into a
// runnable Node bundle. It reuses the static-viz bundle config (same module resolution and loaders,
// so `metabase/static-viz` and its transitive deps resolve identically) but targets Node and drops
// the browser library wrapper, the stats writer, and the browser `process`/`Buffer` polyfill (those
// are real globals on Node — the process/browser shim would otherwise shadow `process.env`).
const rspack = require("@rspack/core");
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const staticVizConfig = require("./rspack.static-viz-graalvm.config.js");

module.exports = (env) => {
  const base = staticVizConfig(env);
  return {
    ...base,
    target: "node",
    entry: {
      "static-viz-server": "../static-viz-server/app.ts",
    },
    output: {
      ...base.output,
      path: __dirname + "/target/static-viz-server",
    },
    plugins: base.plugins.filter(
      (plugin) =>
        !(plugin instanceof StatsWriterPlugin) &&
        !(plugin instanceof rspack.ProvidePlugin),
    ),
  };
};
