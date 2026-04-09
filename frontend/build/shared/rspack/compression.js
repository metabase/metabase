import zlib from "zlib";

// TODO(romeovs): Use compression-rspack-plugin once the configs are using ES modules
// const CompressionPlugin = require("compression-webpack-plugin");
import CompressionPlugin from "compression-webpack-plugin";

import { IS_DEV_MODE } from "../constants.js";

export const COMPRESSION_CONFIG = IS_DEV_MODE
  ? []
  : [
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
