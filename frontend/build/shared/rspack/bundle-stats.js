/* eslint-env node */
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const EMIT_BUNDLE_STATS = process.env.EMIT_BUNDLE_STATS === "true";

// Both bundle outputs (app/dist and app/embedding-sdk) sit four directories
// below the repo root, so this relative path lands in <repo>/target for both.
const STATS_OUTPUT_PREFIX = "../../../../target/bundle-stats/";

/**
 * When EMIT_BUNDLE_STATS is set, writes a minimal stats file (asset names/sizes
 * plus per-entrypoint asset lists) outside the bundle output dir so it never
 * ships inside the uberjar. .github/scripts/measure-bundle-sizes.js reads it to
 * split "initial" (entry + sync chunks) from "total" bundle size.
 *
 * Returns an array so it can be spread into a `plugins` list and disappear when
 * stats are not requested.
 */
function bundleStatsPlugins(statsFileName) {
  if (!EMIT_BUNDLE_STATS) {
    return [];
  }
  return [
    new StatsWriterPlugin({
      stats: { all: false, assets: true, entrypoints: true },
      filename: STATS_OUTPUT_PREFIX + statsFileName,
      transform: (stats) =>
        JSON.stringify({
          assets: (stats.assets || []).map((asset) => ({
            name: asset.name,
            size: asset.size,
          })),
          entrypoints: Object.fromEntries(
            Object.entries(stats.entrypoints || {}).map(([name, entry]) => [
              name,
              {
                assets: (entry.assets || []).map((asset) => ({
                  name: asset.name || asset,
                })),
              },
            ]),
          ),
        }),
    }),
  ];
}

module.exports = { bundleStatsPlugins };
