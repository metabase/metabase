const path = require('path');

var SRC_PATH = path.resolve(__dirname, '../frontend/src');

var CSS_CONFIG = {
    localIdentName: "[name]__[local]___[hash:base64:5]",
    restructuring: false,
    compatibility: true
}

module.exports = {
  module: {
    loaders: [
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
  }
}
