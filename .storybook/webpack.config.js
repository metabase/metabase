const path = require('path');

const WEBPACK_CONFIG = require("../webpack.config");

var SRC_PATH = path.resolve(__dirname, '../frontend/src/metabase');

var CSS_CONFIG = {
    localIdentName: "[name]__[local]___[hash:base64:5]",
    restructuring: false,
    compatibility: true
}

module.exports = {
  module: {
    loaders: [
      {
        test: /\.json$/,
        loader: "json-loader"
      },
      {
        test: /\.css?$/,
        loaders: [ "style", "css-loader?" + JSON.stringify(CSS_CONFIG), "postcss-loader" ]
      }
    ]
  },
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".js", ".jsx", ".css"],
    alias: {
      'metabase': SRC_PATH,
      'style':    SRC_PATH + '/css/core'
    }
  },
  postcss: WEBPACK_CONFIG.postcss
};
