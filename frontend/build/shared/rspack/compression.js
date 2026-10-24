const { IS_DEV_MODE } = require("../constants");

const SHOULD_COMPRESS =
  "COMPRESSION" in process.env
    ? process.env.COMPRESSION === "true"
    : !IS_DEV_MODE;

const COMPRESSION_ASSET_TEST = /\.(js|css|svg)$/;

function getCompressionConfig() {
  if (!SHOULD_COMPRESS) {
    return [];
  }

  // load these modules conditionally so storybook doesn't choke on them
  const zlib = require("zlib");
  const {
    CompressionRspackPlugin,
  } = require("./plugins/CompressionRspackPlugin");

  // eslint-disable-next-line no-console
  console.log(`[Compression] Compressing assets`);

  return [
    new CompressionRspackPlugin({
      algorithm: "gzip",
      test: COMPRESSION_ASSET_TEST,
      filename: "[path][base].gz",
      compressionOptions: {
        level: zlib.constants.Z_MAX_LEVEL,
      },
    }),
    new CompressionRspackPlugin({
      algorithm: "brotliCompress",
      test: COMPRESSION_ASSET_TEST,
      filename: "[path][base].br",
      compressionOptions: {
        params: {
          // Quality 11 is ~2.5x slower than 10 for ~1.5% smaller output.
          [zlib.constants.BROTLI_PARAM_QUALITY]: 10,
        },
      },
    }),
  ];
}

module.exports.COMPRESSION_CONFIG = getCompressionConfig();
