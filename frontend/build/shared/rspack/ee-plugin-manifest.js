const fs = require("fs");
const path = require("path");

const { StatsWriterPlugin } = require("webpack-stats-plugin");

const PLUGIN_FEATURES_PATH = path.resolve(
  __dirname,
  "../../../../enterprise/frontend/src/metabase-enterprise/plugin-features.json",
);

// Must match the `webpackChunkName` of each loader in metabase-enterprise/plugins.ts.
const chunkNameFor = (pluginName) =>
  "ee-plugin-" + pluginName.replaceAll("/", "-");

const assetName = (asset) => (typeof asset === "string" ? asset : asset.name);

/**
 * Writes `ee-plugin-manifest.json` next to the bundles: for each enterprise
 * plugin that loads on demand, the token features it loads for and the files
 * its chunk needs beyond what `app-main` already loads. The server reads it to
 * preload the plugins an instance's token enables.
 *
 * Returns an array so it can be spread into a `plugins` list, and disappears
 * from builds without enterprise plugins.
 */
function eePluginManifestPlugins() {
  if (process.env.MB_EDITION !== "ee") {
    return [];
  }
  const pluginFeatures = JSON.parse(
    fs.readFileSync(PLUGIN_FEATURES_PATH, "utf8"),
  );
  return [
    new StatsWriterPlugin({
      filename: "ee-plugin-manifest.json",
      stats: { all: false, chunkGroups: true, entrypoints: true },
      transform: (stats) => {
        const initialFiles = new Set(
          (stats.entrypoints?.["app-main"]?.assets ?? []).map(assetName),
        );
        const manifest = {};
        for (const [pluginName, features] of Object.entries(pluginFeatures)) {
          const chunkName = chunkNameFor(pluginName);
          const group = stats.namedChunkGroups?.[chunkName];
          if (!group) {
            throw new Error(
              `No chunk named "${chunkName}" for the ${pluginName} plugin. ` +
                "Its loader in metabase-enterprise/plugins.ts needs that webpackChunkName.",
            );
          }
          manifest[pluginName] = {
            features,
            files: group.assets
              .map(assetName)
              .filter((file) => /\.(js|css)$/.test(file))
              .filter((file) => !initialFiles.has(file)),
          };
        }
        return JSON.stringify(manifest);
      },
    }),
  ];
}

module.exports = { eePluginManifestPlugins };
