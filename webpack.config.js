"use strict";
/* global __dirname */

var webpack = require('webpack');
var webpackPostcssTools = require('webpack-postcss-tools');

var CommonsChunkPlugin = webpack.optimize.CommonsChunkPlugin;
var NgAnnotatePlugin = require('ng-annotate-webpack-plugin');
var ExtractTextPlugin = require('extract-text-webpack-plugin');

var _ = require('underscore');
var glob = require('glob');

var BASE_PATH = __dirname + '/resources/frontend_client/app/';

// All JS files except bower_components, dist, and test
var JS_SRC = glob.sync(BASE_PATH + '**/*.js', { ignore: BASE_PATH + '{bower_components,dist,test}/**/*.js' });
// All CSS files in app/css and app/components
var CSS_SRC = glob.sync(BASE_PATH + 'css/**/*.css').concat(glob.sync(BASE_PATH + 'components/**/*.css'));

// Need to scan the CSS files for variable and custom media used across files
// NOTE: this requires "webpack -w" (watch mode) to be restarted when variables change :(
var cssMaps = { vars: {}, media: {}, selector: {} };
CSS_SRC.map(webpackPostcssTools.makeVarMap).forEach(function(map) {
    for (var name in cssMaps) _.extend(cssMaps[name], map[name]);
});

module.exports = {
    // output a bundle for the app JS and a bundle for styles
    // eventually we should have multiple (single file) entry points for various pieces of the app to enable code splitting
    entry: {
        app: JS_SRC,
        styles: CSS_SRC
    },

    // output to "dist"
    output: {
        path: __dirname + '/resources/frontend_client/app/dist',
        filename: '[name].js'
    },

    module: {
        loaders: [
            // JavaScript
            { test: /\.js$/, exclude: /node_modules/, loader: 'babel', query: {
                cacheDirectory: '.babel_cache'
            }},
            // CSS
            { test: /\.css$/, loader: ExtractTextPlugin.extract('style-loader', 'css-loader?sourceMap!cssnext-loader') }
            // { test: /\.css$/, loader: 'style-loader!css-loader!cssnext-loader' }
            // { test: /\.css$/, loader: 'style-loader!css-loader!rework-loader' }
        ]
    },

    plugins: [
        // Automatically annotates angular functions (from "function($foo) {}" to "['$foo', function($foo) {}]")
        // so minification doesn't break dependency injections
        new NgAnnotatePlugin({ add: true }),
        // Separates out modules common to multiple entry points into a single common file that should be loaded first.
        // Not currently useful but necessary for code-splitting
        new CommonsChunkPlugin('common.js'),
        // Extracts initial CSS into a standard stylesheet that can be loaded in parallel with JavaScript
        new ExtractTextPlugin('styles.css')
    ],

    // CSSNext configuration
    cssnext: {
        features: {
            // pass in the variables and custom media we scanned for before
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

    // SourceMaps
    // Normal source map works better but takes longer to build
    devtool: 'source-map'
    // Eval source map doesn't work with CSS but is faster to build
    // devtool: 'eval-source-map'
};
