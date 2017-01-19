/*eslint-env node */

var webpackPostcssTools = require('webpack-postcss-tools');

var _ = require('underscore');
var glob = require('glob');

var SRC_PATH = __dirname + '/frontend/src/metabase';

// Build mapping of CSS variables
var CSS_SRC = glob.sync(SRC_PATH + '/css/**/*.css');
var CSS_MAPS = { vars: {}, media: {}, selector: {} };
CSS_SRC.map(webpackPostcssTools.makeVarMap).forEach(function(map) {
    for (var name in CSS_MAPS) _.extend(CSS_MAPS[name], map[name]);
});

// CSS Next:
var CSSNEXT_CONFIG = {
    features: {
        // pass in the variables and custom media we scanned for before
        customProperties: { variables: CSS_MAPS.vars },
        customMedia: { extensions: CSS_MAPS.media }
    },
    import: {
        path: ['resources/frontend_client/app/css']
    },
    compress: false
};

module.exports = function (webpack) {
    return {
        plugins: [
            require("postcss-import")({
                addDependencyTo: webpack
            }),
            require("postcss-url")({
                url: "rebase" // or "inline" or "copy"
            }),
            require("postcss-cssnext")(CSSNEXT_CONFIG)
        ]
    }
};
