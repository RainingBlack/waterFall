const path = require('path');
const webpack = require('webpack');

//单独打包css
const extractTextPlugin = require('extract-text-webpack-plugin');
const extractLESS = new extractTextPlugin('css/index.css');

//自动上传到服务器
const WebpackSftpClient = require('webpack-sftp-client');
//单独处理生成html
const htmlWebpackPlugin = require('html-webpack-plugin');
//生成日期标志
const buildTime = new Date().toLocaleString();
//编译之前清理目录
const CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
    entry: {
        vendor:["./src/js/vendor.js"],
        entry: "./src/js/entry.js"
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "js/[name].[chunkhash:6].js",
        chunkFilename: 'js/[name].[chunkhash:6].js',
        publicPath: ""
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                loader: "babel-loader",
                options: {
                    presets: ["react","es2015"]
                },
                exclude: /node_modules/
            },
            {
                test: /\.less$/,
                use: extractLESS.extract(['css-loader', 'less-loader'])
            },
            {
                test: /\.(gif|jpg|png|woff|svg|eot|ttf)$/,
                loader: "url-loader",
                query: {
                    name: "../image/[hash].[ext]",
                    limit: 5000
                }
            }
        ]
    },
    plugins: [
        extractLESS,
        new webpack.optimize.CommonsChunkPlugin({
            name : "vendor"
        }),
        new htmlWebpackPlugin({
          title: buildTime,
          filename: 'index.html',
          template: "./src/index.html"
        }),
        new webpack.BannerPlugin("The file is created by innovationer--"+ new Date()),
       
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'developer')
        }),
        new CleanWebpackPlugin(['dist/js/*.js*']),
        //new CleanWebpackPlugin(['dist/css/*.css*']),
        //new webpack.optimize.UglifyJsPlugin()
    ]
};