const { defineConfig } = require("cypress");

const webpackConfig = require("../../webpack.config");

console.log("webpackConfig");
console.log(webpackConfig);

const { mainConfig } = require("./config");

module.exports = defineConfig({
  e2e: mainConfig,

  component: {
    devServer: {
      framework: "react",
      bundler: "webpack",
      webpackConfig,
    },
  },
});
