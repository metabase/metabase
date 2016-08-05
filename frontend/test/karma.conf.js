var webpackConfig = require('../../webpack.config');
webpackConfig.module.postLoaders = [
    { test: /\.js$/, exclude: /(\.spec\.js|vendor|node_modules)/, loader: 'istanbul-instrumenter' }
];

module.exports = function(config) {
    config.set({
        basePath: '../',
        files: [
            'test/metabase-bootstrap.js',
            '../node_modules/angular-mocks/angular-mocks.js',
            'test/unit/**/*.spec.js'
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
            'coverage'
        ],
        webpack: {
            resolve: webpackConfig.resolve,
            module: webpackConfig.module
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
        port: 9876,
        colors: true,
        logLevel: config.LOG_INFO,
        browsers: ['Chrome'],
        autoWatch: true,
        singleRun: false
    });
};
