'use strict';

var webpackConfig = require('./webpack.config');
webpackConfig.cache = true;
webpackConfig.module.postLoaders = [{
  test: /\.js$/,
  exclude: /(_spec|vendor|node_modules)/,
  loader: 'istanbul-instrumenter'
}];

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    files: [
      'resources/frontend_client/app/**/*.spec.js'
    ],
    webpack: {
      resolve: webpackConfig.resolve,
      module: webpackConfig.module
    },
    preprocessors: {
      'resources/frontend_client/app/**/*.spec.js': ['webpack']
    },
    reporters: [
        'progress',
        'coverage'
    ],
    coverageReporter: {
      dir: 'coverage/',
      subdir: function (browser) {
        return browser.toLowerCase().split(/[ /-]/)[0];
      },
      reporters: [
        {type: 'cobertura', file: 'cobertura.xml'},
        {type: 'text', file: 'text.txt'},
        {type: 'text-summary', file: 'text-summary.txt'},
        {type: 'html'}
      ]
    },
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ['Chrome'],
    singleRun: true
  });
};
