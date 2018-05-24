let webpackConfig = require("../../webpack.config");
console.dir(webpackConfig.module.rules, { depth: null });
webpackConfig.module.rules.forEach(function(loader) {
  loader.use = loader.use.filter(
    item => !item.loader.includes("extract-text-webpack-plugin"),
  );
});

module.exports = function(config) {
  config.set({
    basePath: "../",
    files: [
      "test/metabase-bootstrap.js",
      // prevent tests from running twice: https://github.com/nikku/karma-browserify/issues/67#issuecomment-84448491
      {
        pattern: "test/legacy-karma/**/*.spec.js",
        watched: false,
        included: true,
        served: true,
      },
    ],
    exclude: [],
    preprocessors: {
      "test/metabase-bootstrap.js": ["webpack"],
      "test/legacy-karma/**/*.spec.js": ["webpack"],
    },
    frameworks: ["jasmine"],
    reporters: ["progress", "junit"],
    webpack: {
      resolve: webpackConfig.resolve,
      module: webpackConfig.module,
      postcss: webpackConfig.postcss,
    },
    webpackMiddleware: {
      stats: "errors-only",
    },
    junitReporter: {
      outputDir:
        (process.env["CIRCLE_TEST_REPORTS"] || "..") + "/test-report-frontend",
    },
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ["Chrome"],
    autoWatch: true,
    singleRun: false,
  });
};
