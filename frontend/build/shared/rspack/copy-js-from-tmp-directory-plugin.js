const fs = require("fs");
const path = require("path");

const { IS_DEV_MODE } = require("../constants");

const PLUGIN_NAME = "copy-js-from-tmp-directory-plugin";

module.exports.CopyJsFromTmpDirectoryPlugin = ({
  fileName,
  fileNames,
  tmpPath,
  outputPath,
  copySourceMap,
  cleanupInDevMode,
}) => ({
  name: PLUGIN_NAME,
  apply(compiler) {
    compiler.hooks.afterEmit.tap(PLUGIN_NAME, () => {
      fs.mkdirSync(outputPath, { recursive: true });

      const files = fileNames || [fileName];

      for (const name of files) {
        const tmpFilePath = path.join(tmpPath, name);
        const outputFilePath = path.join(outputPath, name);

        fs.copyFileSync(tmpFilePath, outputFilePath);

        if (copySourceMap) {
          const tmpSourceMapPath = `${tmpFilePath}.map`;
          const outputSourceMapPath = `${outputFilePath}.map`;

          if (fs.existsSync(tmpSourceMapPath)) {
            fs.copyFileSync(tmpSourceMapPath, outputSourceMapPath);
          }
        }
      }

      if (!IS_DEV_MODE || cleanupInDevMode) {
        // cleanup the temp directory to prevent bloat.
        fs.rmSync(tmpPath, { recursive: true });
      }
    });
  },
});
