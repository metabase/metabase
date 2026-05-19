const fs = require("fs/promises");
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
    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async () => {
      const fileNames = await readdir(tmpPath);

      // create the output directory if it doesn't exist.
      await fs.mkdir(outputPath, { recursive: true });

      await Promise.all(
        fileNames.map((fileName) => {
          const tmpFilePath = path.join(tmpPath, fileName);
          const outputFilePath = path.join(outputPath, fileName);
          return fs.copyFile(tmpFilePath, outputFilePath);
        }),
      );

      if (!IS_DEV_MODE || cleanupInDevMode) {
        // cleanup the temp directory to prevent bloat.
        await fs.rm(tmpPath, { recursive: true, force: true });
      }
    });
  },
});

async function readdir(dir) {
  try {
    return await fs.readdir(dir);
  } catch (e) {
    return [];
  }
}
