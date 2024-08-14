const { defineConfig } = require("cypress");

const { stressTestConfig } = require("./config");

module.exports = defineConfig({ e2e: stressTestConfig });
