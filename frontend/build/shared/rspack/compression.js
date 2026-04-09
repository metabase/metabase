import zlib from "zlib";

import { CompressionRspackPlugin } from "compression-rspack-plugin";

import { IS_DEV_MODE } from "../constants.js";

const SHOULD_COMPRESS =
  "COMPRESSION" in process.env
    ? process.env.COMPRESSION === "true"
    : !IS_DEV_MODE;

export const COMPRESSION_CONFIG = SHOULD_COMPRESS
  ? [
      new CompressionRspackPlugin({
        algorithm: "gzip",
        test: /\.(js|css)$/,
        filename: "[path][base].gz",
        compressionOptions: {
          level: 9,
        },
      }),
      new CompressionRspackPlugin({
        algorithm: "brotliCompress",
        test: /\.(js|css)$/,
        filename: "[path][base].br",
        compressionOptions: {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
          },
        },
      }),
    ]
  : [];
