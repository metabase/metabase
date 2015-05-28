var ngAnnotatePlugin = require('ng-annotate-webpack-plugin');

module.exports = {
    // context: __dirname + '/resources/frontend_client',
    // entry: './app/index.js',
    output: {
        path: __dirname + '/resources/frontend_client/app/dist',
        filename: 'bundle.js'
    },
    module: {
        loaders: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: "babel",
                query: {
                    cacheDirectory: ".babel_cache"
                }
            }
        ]
    },
    plugins: [
        new ngAnnotatePlugin({
            add: true
        })
    ],
    devtool: "eval-source-map"
}
