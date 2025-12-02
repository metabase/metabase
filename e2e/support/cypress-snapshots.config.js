const { defineConfig } = require("cypress");

const { defaultConfig } = require("./config");

module.exports = defineConfig({
  e2e: {
    ...defaultConfig,
    specPattern: "e2e/snapshot-creators/**/*.cy.snap.js",
    video: false,
  },
});
