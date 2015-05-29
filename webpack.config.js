var webpack = require('webpack');
var webpackPostcssTools = require('webpack-postcss-tools');

var CommonsChunkPlugin = webpack.optimize.CommonsChunkPlugin;
var NgAnnotatePlugin = require('ng-annotate-webpack-plugin');
var ExtractTextPlugin = require('extract-text-webpack-plugin');

var _ = require('underscore');
var glob = require('glob');

var BASE_PATH = __dirname + '/resources/frontend_client/app/';

var JS_SRC = glob.sync(BASE_PATH + '**/*.js', { ignore: BASE_PATH + '{bower_components,dist,test}/**/*.js' });
var CSS_SRC = glob.sync(BASE_PATH + 'css/**/*.css').concat(glob.sync(BASE_PATH + 'components/**/*.css'));

var cssMaps = { vars: {}, media: {}, selector: {} };
CSS_SRC.map(webpackPostcssTools.makeVarMap).forEach(function(map) {
    for (name in cssMaps) _.extend(cssMaps[name], map[name]);
});

module.exports = {
    entry: {
        app: JS_SRC,
        styles: CSS_SRC
    },

    output: {
        path: __dirname + '/resources/frontend_client/app/dist',
        filename: '[name].js'
    },

    module: {
        loaders: [
            { test: /\.js$/, exclude: /node_modules/, loader: 'babel', query: {
                cacheDirectory: '.babel_cache'
            }},
            // { test: /\.css$/, loader: 'style-loader!css-loader!rework-loader' }
            // { test: /\.css$/, loader: 'style-loader!css-loader!cssnext-loader' }
            { test: /\.css$/, loader: ExtractTextPlugin.extract('style-loader', 'css-loader?sourceMap!cssnext-loader') }
        ]
    },

    plugins: [
        new NgAnnotatePlugin({ add: true }),
        new CommonsChunkPlugin('common.js'),
        new ExtractTextPlugin('styles.css')
    ],

    cssnext: {
        features: {
            customProperties: { variables: cssMaps.vars },
            customMedia: { extensions: cssMaps.media }
        },
        import: {
            path: ['resources/frontend_client/app/css']
        }
    },

    // rework: {
    //     use: [
    //         myth({ variables: maps.vars, customMedia: maps.media })
    //     ]
    // },

        devtool: 'source-map'
        // devtool: 'eval-source-map'
}
