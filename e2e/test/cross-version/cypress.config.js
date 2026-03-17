const { defineConfig } = require("cypress");

const { defaultConfig } = require("../../support/config");

module.exports = defineConfig({
  e2e: {
    ...defaultConfig,
    specPattern: "e2e/test/cross-version/scenarios/**/*.cy.spec.ts",
    viewportWidth: 1600,
    viewportHeight: 1200,
  },
});
