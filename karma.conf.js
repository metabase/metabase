'use strict';

var webpackConfig = require('./webpack.config');
webpackConfig.module.postLoaders = [
    { test: /\.js$/, exclude: /(_spec|vendor|node_modules)/, loader: 'istanbul-instrumenter' }
];

module.exports = function(config) {
    config.set({
        basePath: '',
        files: [
            'resources/frontend_client/app/dist/vendor.js',
            // 'resources/frontend_client/vendor.js',
            'node_modules/angular-mocks/angular-mocks.js',
            'resources/frontend_client/app/dist/app.js',
            'resources/frontend_client/app/**/*.spec.js'
        ],
        exclude: [
        ],
        preprocessors: {
            'resources/frontend_client/vendor.js': ['webpack'],
            'resources/frontend_client/app/**/*.spec.js': ['webpack']
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
            dir: 'coverage/',
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
