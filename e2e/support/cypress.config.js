const { defineConfig } = require("cypress");

const { readSpecPlan } = require("../runner/read-spec-plan");

const { mainConfig } = require("./config");

const specFiles = readSpecPlan(process.env.E2E_SPEC_PATHS_FILE);

module.exports = defineConfig({
  e2e: {
    ...mainConfig,
    ...(specFiles !== null && { specPattern: specFiles }),
  },
});
