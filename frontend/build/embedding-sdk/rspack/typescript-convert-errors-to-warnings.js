const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

// https://github.com/TypeStrong/fork-ts-checker-webpack-plugin/issues/232#issuecomment-1322651312
module.exports.TypescriptConvertErrorsToWarnings = class {
  apply(compiler) {
    const hooks = ForkTsCheckerWebpackPlugin.getCompilerHooks(compiler);

    hooks.issues.tap("TypeScriptWarnOnlyWebpackPlugin", (issues) =>
      issues.map((issue) => ({ ...issue, severity: "warning" })),
    );
  }
};
