const { defineConfig } = require("cypress");
const {
  crossVersionTargetConfig,
} = require("../../../../__support__/e2e/config");

module.exports = defineConfig({ e2e: crossVersionTargetConfig });
