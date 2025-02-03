const { defineConfig } = require("cypress");

const { mainConfig } = require("./config");

module.exports = defineConfig({
  e2e: mainConfig,

  component: {
    devServer: {
      framework: "react",
      bundler: "webpack",
    },
  },
});
