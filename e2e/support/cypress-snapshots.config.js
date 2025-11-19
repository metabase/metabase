const { defineConfig } = require("cypress");

const { defaultConfig } = require("./config");

const isQaDatabase = process.env["QA_DB_ENABLED"] === "true";

module.exports = defineConfig({
  e2e: {
    ...defaultConfig,
    specPattern: "e2e/snapshot-creators/**/*.cy.snap.js",
    excludeSpecPattern: !isQaDatabase
      ? "e2e/snapshot-creators/qa-db.cy.snap.js"
      : undefined,
    video: false,
  },
});
