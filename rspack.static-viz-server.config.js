const rspack = require("@rspack/core");
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const staticVizConfig = require("./rspack.static-viz-graalvm.config.js");

module.exports = (env) => {
  const base = staticVizConfig(env);
  return {
    ...base,
    target: "node",
    entry: {
      "static-viz-server": "../static-viz-server/index.ts",
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
