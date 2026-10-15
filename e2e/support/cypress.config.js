const { defineConfig } = require("cypress");

const { readSpecPaths } = require("../runner/read-spec-paths");

const { mainConfig } = require("./config");

const specFiles = readSpecPaths(process.env.E2E_SPEC_PATHS_FILE);

module.exports = defineConfig({
  e2e: {
    ...mainConfig,
    ...(specFiles !== null && { specPattern: specFiles }),
  },
});
