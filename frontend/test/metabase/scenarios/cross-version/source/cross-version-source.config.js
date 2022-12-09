const { defineConfig } = require("cypress");
const {
  crossVersionSourceConfig,
} = require("../../../../__support__/e2e/config");

module.exports = defineConfig({ e2e: crossVersionSourceConfig });
