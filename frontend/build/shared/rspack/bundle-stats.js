/* eslint-env node */
const { StatsWriterPlugin } = require("webpack-stats-plugin");

const EMIT_BUNDLE_STATS = process.env.EMIT_BUNDLE_STATS === "true";

// Both bundle outputs (app/dist and app/embedding-sdk) sit four directories
// below the repo root, so this relative path lands in <repo>/target for both.
const STATS_OUTPUT_PREFIX = "../../../../target/bundle-stats/";

// Walk the chunk graph from an entrypoint's initial chunks over their async
// children, returning every .js asset reachable from that entrypoint (initial +
// lazily imported). Lets measure-bundle-sizes.js scope an entrypoint's "total"
// to its own reachable code instead of the whole output dir.
function reachableJsAssets(initialChunkIds, chunkById) {
  const seen = new Set();
  const queue = [...(initialChunkIds || [])];
  const files = new Set();
  while (queue.length > 0) {
    const id = queue.shift();
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const chunk = chunkById.get(id);
    if (!chunk) {
      continue;
    }
    for (const file of chunk.files) {
      files.add(file);
    }
    for (const child of chunk.children) {
      queue.push(child);
    }
  }
  return [...files];
}

/**
 * When EMIT_BUNDLE_STATS is set, writes a minimal stats file (asset names/sizes
 * plus per-entrypoint asset lists) outside the bundle output dir so it never
 * ships inside the uberjar. .github/scripts/measure-bundle-sizes.js reads it to
 * split each entrypoint's "initial" (entry + sync chunks) from its reachable
 * "total" (initial + async children).
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
      stats: {
        all: false,
        assets: true,
        entrypoints: true,
        chunks: true,
        ids: true,
        chunkRelations: true,
      },
      filename: STATS_OUTPUT_PREFIX + statsFileName,
      transform: (stats) => {
        const chunkById = new Map(
          (stats.chunks || []).map((chunk) => [
            chunk.id,
            {
              files: (chunk.files || []).filter((file) => file.endsWith(".js")),
              children: chunk.children || [],
            },
          ]),
        );
        return JSON.stringify({
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
                reachableAssets: reachableJsAssets(entry.chunks, chunkById).map(
                  (file) => ({ name: file }),
                ),
              },
            ]),
          ),
        });
      },
    }),
  ];
}

module.exports = { bundleStatsPlugins };
