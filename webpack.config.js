var path = require('path');

module.exports = {
  entry: {
    main: ['babel-polyfill', './src/main'],
    worker: ['babel-polyfill', './src/worker']
  },
  output: {
    path: path.join(__dirname, 'dist'),
    publicPath: '/dist/',
    filename: '[name].js',
    chunkFilename: '[id].chunk.js'
  },
  debug: true,
  devtool: 'source-map',
  module: {
    loaders: [
      {
        test: /\.js$/,
        include: path.join(__dirname, 'src'),
        loader: 'babel-loader',
        query: {
          presets: ['es2015']
        }
      }, {
        test: /\.scss$/,
        loader: 'style!css!autoprefixer!scss'
      }, {
        test: /\.json$/,
        loader: 'json'
      }
    ]
  }
};
