const YAML = require("json-to-pretty-yaml");
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const {
  createStaticVizConfig,
  ROOT_PATH,
} = require("./frontend/build/shared/rspack/static-viz-config");

const MAX_ASSET_SIZE = 3.5 * 1024 * 1024;

module.exports = () =>
  createStaticVizConfig({
    entryName: "lib-static-viz",
    entryImport: "./app-static-viz.ts",
    maxAssetSize: MAX_ASSET_SIZE,
    plugins: [
      new StatsWriterPlugin({
        stats: {
          modules: true,
          assets: false,
          nestedModules: false,
          reasons: false,
          excludeModules: [/node_modules/],
        },
        filename: "../../../../.github/static-viz-sources.yaml",
        transform: (stats) =>
          YAML.stringify({
            static_viz: stats.modules
              .filter(
                (module) =>
                  module.type !== "hidden modules" &&
                  module.moduleType !== "runtime" &&
                  module.nameForCondition != null,
              )
              .map((module) =>
                module.nameForCondition.replace(`${ROOT_PATH}/`, ""),
              ),
          }),
      }),
    ],
  });
