const path = require('path');

var CSS_CONFIG = {
    localIdentName: "[local]---[hash:base64:5]",
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
  }
}
