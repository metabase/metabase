// @ts-check
const rspack = require("@rspack/core");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const PLUGIN_NAME = "DropStylesEntryScriptPlugin";
const STYLES_ENTRY = "styles";

/**
 * The `styles` entry is a stylesheet, so the JS file emitted beside it holds one
 * empty module and does nothing. This drops that file, its script tag and its
 * preload hint, and leaves the stylesheet alone.
 *
 * Only for production builds: in dev the entry also carries the hot-reload runtime.
 */
class DropStylesEntryScriptPlugin {
  apply(/** @type {import("webpack").Compiler} */ compiler) {
    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (/** @type {import("webpack").Compilation} */ compilation) => {
        const scripts = () =>
          [...(compilation.namedChunks.get(STYLES_ENTRY)?.files ?? [])].filter(
            (file) => file.endsWith(".js"),
          );

        // Runs before PreloadAssetTags, which builds its hints from the tags
        // left here, so the preload goes with the script tag.
        HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapAsync(
          PLUGIN_NAME,
          (data, cb) => {
            const files = scripts();
            data.assetTags.scripts = data.assetTags.scripts.filter(
              (tag) =>
                !files.some((file) => tag.attributes.src?.endsWith(file)),
            );
            cb(null, data);
          },
        );

        // Early enough that the compression plugins never see the file.
        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            stage: rspack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          () => {
            for (const file of scripts()) {
              compilation.deleteAsset(file);
            }
          },
        );
      },
    );
  }
}

module.exports.DropStylesEntryScriptPlugin = DropStylesEntryScriptPlugin;
