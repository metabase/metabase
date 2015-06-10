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

// All JS files except dist and test
var JS_SRC = glob.sync(BASE_PATH + '**/*.js', { ignore: BASE_PATH + '{bower_components,dist,test}/**/*.js' });
// All CSS files in app/css and app/components
var CSS_SRC = glob.sync(BASE_PATH + 'css/**/*.css').concat(glob.sync(BASE_PATH + 'components/**/*.css'));

// Need to scan the CSS files for variable and custom media used across files
// NOTE: this requires "webpack -w" (watch mode) to be restarted when variables change :(
console.warn("Warning: in weback watch mode you must restart webpack if you change any CSS variables or custom media queries");
var cssMaps = { vars: {}, media: {}, selector: {} };
CSS_SRC.map(webpackPostcssTools.makeVarMap).forEach(function(map) {
    for (var name in cssMaps) _.extend(cssMaps[name], map[name]);
});

module.exports = {
    // output a bundle for the app JS and a bundle for styles
    // eventually we should have multiple (single file) entry points for various pieces of the app to enable code splitting
    entry: {
        vendor: __dirname + '/resources/frontend_client/vendor.js',
        app: JS_SRC,
        styles: [
            __dirname + '/resources/frontend_client/vendor.css'
        ].concat(CSS_SRC)
    },

    // output to "dist"
    output: {
        path: __dirname + '/resources/frontend_client/app/dist',
        filename: '[name].js'
    },

    module: {
        loaders: [
            // JavaScript
            { test: /\.js$/, exclude: /node_modules/, loader: 'babel', query: { cacheDirectory: '.babel_cache' }},
            { test: /\.js$/, exclude: /node_modules/, loader: 'eslint' },
            // CSS
            { test: /\.css$/, loader: ExtractTextPlugin.extract('style-loader', 'css-loader?sourceMap!cssnext-loader') }
            // { test: /\.css$/, loader: 'style-loader!css-loader!cssnext-loader' }
        ],
        noParse: [
            /node_modules\/(angular|ng-|ace|react|moment|underscore|jquery|d3|crossfilter)/ // doesn't include 'dc' and 'tether' due to use of 'require'
        ]
    },

    resolve: {
        modulesDirectories: [],
        alias: {
            'metabase':             __dirname + '/resources/frontend_client/app',

            // angular
            'angular':              __dirname + '/node_modules/angular/angular.min.js',
            'angular-animate':      __dirname + '/node_modules/angular-animate/angular-animate.min.js',
            'angular-cookies':      __dirname + '/node_modules/angular-cookies/angular-cookies.min.js',
            'angular-resource':     __dirname + '/node_modules/angular-resource/angular-resource.min.js',
            'angular-route':        __dirname + '/node_modules/angular-route/angular-route.min.js',
            'angular-sanitize':     __dirname + '/node_modules/angular-sanitize/angular-sanitize.min.js',
            // angular 3rd-party
            'angular-bootstrap':    __dirname + '/node_modules/angular-bootstrap/dist/ui-bootstrap-tpls.min.js',
            'angular-cookie':       __dirname + '/node_modules/angular-cookie/angular-cookie.min.js',
            'angular-gridster':     __dirname + '/node_modules/angular-gridster/dist/angular-gridster.min.js',
            'angular-http-auth':    __dirname + '/node_modules/angular-http-auth/src/http-auth-interceptor.js',
            'angular-readable-time':__dirname + '/node_modules/angular-readable-time/angular-readable-time.min.js',
            'angular-xeditable':    __dirname + '/node_modules/angular-xeditable/dist/js/xeditable.min.js',
            'ng-sortable':          __dirname + '/node_modules/ng-sortable/dist/ng-sortable.min.js',
            'angularytics':         __dirname + '/node_modules/angularytics/dist/angularytics.min.js',
            'angular-ui-ace':       __dirname + '/node_modules/angular-ui-ace/src/ui-ace.js',
            // ace
            'ace/ace':              __dirname + '/node_modules/ace-builds/src-min-noconflict/ace.js',
            'ace/ext-language_tools':__dirname+ '/node_modules/ace-builds/src-min-noconflict/ext-language_tools.js',
            'ace/mode-sql':         __dirname + '/node_modules/ace-builds/src-min-noconflict/mode-sql.js',
            'ace/snippets/sql':     __dirname + '/node_modules/ace-builds/src-min-noconflict/snippets/sql.js',
            // react
            'react':                __dirname + '/node_modules/react/dist/react-with-addons.js',
            'react-onclickoutside': __dirname + '/node_modules/react-onclickoutside/index.js',
            'react-datepicker':     __dirname + '/node_modules/react-datepicker/react-datepicker.js',
            'moment':               __dirname + '/node_modules/moment/min/moment.min.js',
            'tether':               __dirname + '/node_modules/tether/tether.min.js',
            'underscore':           __dirname + '/node_modules/underscore/underscore-min.js',
            'jquery':               __dirname + '/node_modules/jquery/dist/jquery.min.js',
            'd3':                   __dirname + '/node_modules/d3/d3.min.js',
            'crossfilter':          __dirname + '/node_modules/crossfilter/crossfilter.min.js',
            'dc':                   __dirname + '/node_modules/dc/dc.min.js',
        }
    },

    plugins: [
        // Automatically annotates angular functions (from "function($foo) {}" to "['$foo', function($foo) {}]")
        // so minification doesn't break dependency injections
        // new NgAnnotatePlugin({ add: true }),
        // Separates out modules common to multiple entry points into a single common file that should be loaded first.
        // Not currently useful but necessary for code-splitting
        // new CommonsChunkPlugin('vendor', 'vendor.bundle.js'),
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

    // SourceMaps
    // Normal source map works better but takes longer to build
    // devtool: 'source-map'
    // Eval source map doesn't work with CSS but is faster to build
    // devtool: 'eval-source-map'
};
