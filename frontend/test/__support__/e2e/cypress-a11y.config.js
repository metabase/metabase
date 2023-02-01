const { defineConfig } = require("cypress");
const { a11yConfig } = require("./config");

module.exports = defineConfig({ e2e: a11yConfig });
