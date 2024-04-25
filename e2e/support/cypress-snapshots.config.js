const { defineConfig } = require("cypress");

const { snapshotsConfig } = require("./config");

module.exports = defineConfig({ e2e: snapshotsConfig });
