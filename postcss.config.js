const webpackPostcssTools = require('webpack-postcss-tools');
const _ = require('underscore');
const glob = require('glob');

var SRC_PATH = __dirname + '/frontend/src/metabase';
// Build mapping of CSS variables
const CSS_SRC = glob.sync(SRC_PATH + '/css/**/*.css');
const CSS_MAPS = { vars: {}, media: {}, selector: {} };
CSS_SRC.map(webpackPostcssTools.makeVarMap).forEach(function(map) {
    for (let name in CSS_MAPS) _.extend(CSS_MAPS[name], map[name]);
});

// CSS Next:
const CSSNEXT_CONFIG = {
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

module.exports = {
    plugins: {
        'postcss-import': {},
        'postcss-url': {},
        'postcss-cssnext': CSSNEXT_CONFIG,
    }
}
