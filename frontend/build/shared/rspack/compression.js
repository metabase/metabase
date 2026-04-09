const zlib = require("zlib");

// TODO(romeovs): Use compression-rspack-plugin once the configs are using ES modules
const CompressionPlugin = require("compression-webpack-plugin");

const { IS_DEV_MODE } = require("../constants");

if (IS_DEV_MODE) {
  module.exports.COMPRESSION_CONFIG = [];
} else {
  module.exports.COMPRESSION_CONFIG = [
    new CompressionPlugin({
      algorithm: "gzip",
      test: /\.(js|css)$/,
      filename: "[path][base].gz",
      compressionOptions: {
        level: 9,
      },
    }),
    new CompressionPlugin({
      algorithm: "brotliCompress",
      test: /\.(js|css)$/,
      filename: "[path][base].br",
      compressionOptions: {
        // @ts-expect-error
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      },
    }),
  ];
}
