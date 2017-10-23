/* eslint-env node */
/* eslint-disable import/no-commonjs */

const webpack = require('webpack')
const merge = require('webpack-merge')
const common = require('./webpack.common.js')

const BABEL_CONFIG = require('./webpack.common.js').BABEL_CONFIG

module.exports = merge(common, {
    devServer: {
        hot: true,
        inline: true,
        contentBase: "frontend",
        headers: {
            'Access-Control-Allow-Origin': '*'
        }
        // if webpack doesn't reload UI after code change in development
        // watchOptions: {
        //     aggregateTimeout: 300,
        //     poll: 1000
        // }
        // if you want to reduce stats noise
        // stats: 'minimal' // values: none, errors-only, minimal, normal, verbose
    },
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.jsx$/,
                exclude: /node_modules/,
                use: [
                    // NOTE Atte Keinänen 10/19/17: We are currently sticking to an old version of react-hot-loader
                    // because newer versions would require us to upgrade to react-router v4 and possibly deal with
                    // asynchronous route issues as well. See https://github.com/gaearon/react-hot-loader/issues/249
                    { loader: 'react-hot-loader' },
                    { loader: 'babel-loader', options: BABEL_CONFIG }
                ]

            }
        ]
    },
    output: {
        devtoolModuleFilenameTemplate: '[absolute-resource-path]',

        // suffixing with ".hot" allows us to run both `yarn run build-hot`
        // and `yarn run test` or `yarn run test-watch` simultaneously
        filename: '[name].hot.bundle.js?[hash]',

        pathinfo: true,

        // point the publicPath (inlined in index.html by HtmlWebpackPlugin)
        // to the hot-reloading server
        publicPath:  "http://localhost:8080/" + common.output.publicPath
    },
    plugins: [
        new webpack.NoEmitOnErrorsPlugin(),
        new webpack.NamedModulesPlugin(),
        new webpack.HotModuleReplacementPlugin()
    ]
})

/*
    if (NODE_ENV === "hot") {
        config.module.rules.unshift({
        });

        // disable ExtractTextPlugin
        config.module.rules[config.module.rules.length - 1].use = [
            { loader: "style-loader" },
            { loader: "css-loader", options: CSS_CONFIG },
            { loader: "postcss-loader" }
        ]
    }
*/
