const { defineConfig } = require("cypress");

const { crossVersionTargetConfig } = require("e2e/support/config");

module.exports = defineConfig({ e2e: crossVersionTargetConfig });
