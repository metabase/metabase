// @ts-check

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT_PATH = path.resolve(__dirname, "../../../../../..");

class TranslationResources {
  built = false;

  apply(/** @type {import("webpack").Compiler} */ compiler) {
    const build = () => {
      if (!this.built) {
        execFileSync(
          path.join(ROOT_PATH, "bin/i18n/build-translation-resources"),
          { cwd: ROOT_PATH, stdio: "inherit" },
        );
        this.built = true;
      }
    };
    compiler.hooks.beforeRun.tap("TranslationResources", build);
    compiler.hooks.watchRun.tap("TranslationResources", build);
  }
}

module.exports.TranslationResources = TranslationResources;
