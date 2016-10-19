var webpackConfig = require('../../webpack.config');
webpackConfig.module.postLoaders = [
    { test: /\.js$/, exclude: /(\.spec\.js|vendor|node_modules)/, loader: 'istanbul-instrumenter' }
];
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
            'coverage',
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
        webpackMiddleware: {
            stats: "errors-only",
        },
        coverageReporter: {
            dir: '../coverage/',
            subdir: function(browser) {
                return browser.toLowerCase().split(/[ /-]/)[0];
            },
            reporters: [
                { type: 'text', file: 'text.txt' },
                { type: 'text-summary', file: 'text-summary.txt' },
                { type: 'html' }
            ]
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
