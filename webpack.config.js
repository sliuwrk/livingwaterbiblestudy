const path = require('path');

module.exports = (env, argv) => {
    const isProd = argv.mode === 'production';

    return {
        mode: isProd ? 'production' : 'development',

        entry: './js/site.js',

        output: {
            path: path.resolve(__dirname, 'js'),
            filename: 'lwbs.min.js'
        },

        devtool: isProd ? false : 'source-map',

        optimization: {
            minimize: isProd
        }
    };
};