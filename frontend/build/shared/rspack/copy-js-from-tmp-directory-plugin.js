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
      fs.mkdirSync(tmpPath, { recursive: true });
      fs.copyFileSync(tmpFilePath, outputFilePath);

      if (copySourceMap) {
        const tmpSourceMapPath = `${tmpFilePath}.map`;
        const outputSourceMapPath = `${outputFilePath}.map`;

        if (fs.existsSync(tmpSourceMapPath)) {
          fs.copyFileSync(tmpSourceMapPath, outputSourceMapPath);
        }
      }

      if (!IS_DEV_MODE || cleanupInDevMode) {
        // cleanup the temp directory to prevent bloat.
        fs.rmSync(tmpPath, { recursive: true });
      }
    });
  },
});
