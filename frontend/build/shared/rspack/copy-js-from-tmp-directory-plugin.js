const fs = require("fs");
const path = require("path");

const { IS_DEV_MODE } = require("../constants");

const PLUGIN_NAME = "copy-js-from-tmp-directory-plugin";

module.exports.CopyJsFromTmpDirectoryPlugin = ({
  fileName,
  tmpPath,
  outputPath,
  copySourceMap,
  cleanupInDevMode,
}) => ({
  name: PLUGIN_NAME,
  apply(compiler) {
    compiler.hooks.afterEmit.tap(PLUGIN_NAME, () => {
      const tmpFilePath = path.join(tmpPath, fileName);
      const outputFilePath = path.join(outputPath, fileName);

      // copy embedding-sdk.js from the temp directory to the resources directory
      fs.mkdirSync(outputPath, { recursive: true });
      fs.copyFileSync(tmpFilePath, outputFilePath);

      if (copySourceMap) {
        const tmpSourceMapPath = `${tmpFilePath}.map`;
        const outputSourceMapPath = `${outputFilePath}.map`;

        if (fs.existsSync(tmpSourceMapPath)) {
          fs.copyFileSync(tmpSourceMapPath, outputSourceMapPath);
        }
      }

      // Copy all chunk files (*.embedding-sdk.js) to embedding-sdk/ subfolder
      const chunksOutputPath = path.join(outputPath, "embedding-sdk");
      fs.mkdirSync(chunksOutputPath, { recursive: true });

      if (fs.existsSync(tmpPath)) {
        const files = fs.readdirSync(tmpPath);
        files.forEach(file => {
          if (file.endsWith(".embedding-sdk.js") || (copySourceMap && file.endsWith(".embedding-sdk.js.map"))) {
            const tmpChunkPath = path.join(tmpPath, file);
            const outputChunkPath = path.join(chunksOutputPath, file);
            fs.copyFileSync(tmpChunkPath, outputChunkPath);
          }
        });
      }

      if (!IS_DEV_MODE || cleanupInDevMode) {
        // cleanup the temp directory to prevent bloat.
        fs.rmSync(tmpPath, { recursive: true });
      }
    });
  },
});
