// @ts-check

const MANIFEST_FILENAME = "locale-manifest.json";
const LOCALE_CHUNK_NAME = /^locale-(.+)-json$/;

/**
 * Publishes where the build put each locale catalogue.
 *
 * `metabase/utils/localization` imports the catalogues, so rspack already emits
 * one hashed chunk per locale. The backend needs their filenames to put the one
 * a request needs into the document as a script tag: the chunk installs itself,
 * and the import that follows resolves from memory rather than over the network.
 */
class LocaleCatalogManifest {
  apply(/** @type {import("webpack").Compiler} */ compiler) {
    const { RawSource } = compiler.webpack.sources;
    const publicPath = String(compiler.options.output.publicPath ?? "");

    compiler.hooks.thisCompilation.tap(
      "LocaleCatalogManifest",
      (/** @type {import("webpack").Compilation} */ compilation) => {
        compilation.hooks.processAssets.tap(
          {
            name: "LocaleCatalogManifest",
            stage:
              compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
          },
          () => {
            /** @type {Record<string, string>} */
            const urls = {};
            for (const chunk of compilation.chunks) {
              const locale = chunk.name?.match(LOCALE_CHUNK_NAME)?.[1];
              const file = [...chunk.files].find((name) =>
                name.endsWith(".js"),
              );
              if (locale && file) {
                urls[locale] = publicPath + file;
              }
            }

            compilation.emitAsset(
              MANIFEST_FILENAME,
              new RawSource(JSON.stringify(urls)),
            );
          },
        );
      },
    );
  }
}

module.exports.LocaleCatalogManifest = LocaleCatalogManifest;
