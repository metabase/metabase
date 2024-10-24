const webpackConfig = require('./webpack.config.js');

module.exports = {
  component: {
    devServer: {
      framework: 'react',
      bundler: 'webpack',
      webpackConfig: webpackConfig
    },
  },
};
