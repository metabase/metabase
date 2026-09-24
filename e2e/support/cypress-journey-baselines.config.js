const { defineConfig } = require("cypress");

const { defaultConfig } = require("./config");

module.exports = defineConfig({
  e2e: {
    ...defaultConfig,
    specPattern: [
      "e2e/test/scenarios/coverage-baseline.cy.spec.js",
      "e2e/journey-capture/baselines/*.cy.baseline.js",
    ],
    video: false,
  },
});
