const { defineConfig } = require("cypress");

const { crossVersionSourceConfig } = require("e2e/support/config");

module.exports = defineConfig({ e2e: crossVersionSourceConfig });
