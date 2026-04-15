const fs = require("fs");
const path = require("path");

const { IS_DEV_MODE } = require("../constants");

const PLUGIN_NAME = "copy-js-from-tmp-directory-plugin";

module.exports.CopyJsFromTmpDirectoryPlugin = ({
  tmpPath,
  outputPath,
  cleanupInDevMode,
}) => ({
  name: PLUGIN_NAME,
  apply(compiler) {
    compiler.hooks.afterEmit.tap(PLUGIN_NAME, () => {
      const fileNames = fs.readdirSync(tmpPath);

      fs.mkdirSync(outputPath, { recursive: true });

      for (const fileName of fileNames) {
        const tmpFilePath = path.join(tmpPath, fileName);
        const outputFilePath = path.join(outputPath, fileName);

        fs.copyFileSync(tmpFilePath, outputFilePath);
      }

      if (!IS_DEV_MODE || cleanupInDevMode) {
        // cleanup the temp directory to prevent bloat.
        fs.rmSync(tmpPath, { recursive: true });
      }
    });
  },
});
