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

  try {
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
          level: 9,
        },
      }),
      new CompressionRspackPlugin({
        algorithm: "brotliCompress",
        test: COMPRESSION_ASSET_TEST,
        filename: "[path][base].br",
        compressionOptions: {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          },
        },
      }),
    ];
  } catch (e) {
    return [];
  }
}

module.exports.COMPRESSION_CONFIG = getCompressionConfig();
