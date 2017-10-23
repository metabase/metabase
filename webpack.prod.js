/* eslint-env node */
/* eslint-disable import/no-commonjs */

const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')

const chevrotain = require("chevrotain");
// tokens related to chevrotain
const allTokens = require("./frontend/src/metabase/lib/expressions/tokens").allTokens;

module.exports = merge(common, {
    devtool: 'source-map',
    plugins: [
        new UglifyJsPlugin({
            uglifyOptions: {
                mangle: {
                    // this is required to ensure we don't minify Chevrotain token identifiers
                    // https://github.com/SAP/chevrotain/tree/master/examples/parser/minification
                    except: allTokens.map(function(currTok) {
                        return chevrotain.tokenName(currTok);
                    })
                }
            }
        })
    ]
})

