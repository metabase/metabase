var webpackConfig = require('../../webpack.config');
webpackConfig.module.loaders.forEach(function(loader) {
    loader.loader = loader.loader.replace(/^.*extract-text-webpack-plugin[^!]+!/, "");
});

module.exports = function(config) {
    config.set({
        basePath: '../',
        files: [
            'test/metabase-bootstrap.js',
            // prevent tests from running twice: https://github.com/nikku/karma-browserify/issues/67#issuecomment-84448491
            { pattern: 'test/unit/**/*.spec.js', watched: false, included: true, served: true }
        ],
        exclude: [
        ],
        preprocessors: {
            'test/metabase-bootstrap.js': ['webpack'],
            'test/unit/**/*.spec.js': ['webpack']
        },
        frameworks: [
            'jasmine'
        ],
        reporters: [
            'progress',
            'junit'
        ],
        webpack: {
            resolve: webpackConfig.resolve,
            module: webpackConfig.module,
            postcss: webpackConfig.postcss
        },
        webpackMiddleware: {
            stats: "errors-only"
        },
        junitReporter: {
            outputDir: (process.env["CIRCLE_TEST_REPORTS"] || "..") + "/test-report-frontend"
        },
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        browsers: ['Chrome'],
        autoWatch: true,
        singleRun: false
    });
};
