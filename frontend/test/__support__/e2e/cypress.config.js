const { defineConfig } = require("cypress");

/**
 * This env var provides the token to the backend.
 * If it is not present, we skip some tests that depend on a valid token.
 *
 * @type {boolean}
 */
const hasEnterpriseToken =
  process.env["MB_PREMIUM_EMBEDDING_TOKEN"] &&
  process.env["MB_EDITION"] === "ee";

const hasSnowplowMicro = process.env["MB_SNOWPLOW_AVAILABLE"];
const snowplowMicroUrl = process.env["MB_SNOWPLOW_URL"];

const isQaDatabase = process.env["QA_DB_ENABLED"];

const sourceVersion = process.env["CROSS_VERSION_SOURCE"];
const targetVersion = process.env["CROSS_VERSION_TARGET"];

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

const createBundler = require("@bahmutov/cypress-esbuild-preprocessor");

module.exports = defineConfig({
  e2e: {
    // This is the functionality of the old cypress-plugins.js file
    setupNodeEvents(on, config) {
      // `on` is used to hook into various events Cypress emits
      // `config` is the resolved Cypress config
      require("cypress-grep/src/plugin")(config);

      /********************************************************************
       **                        PREPROCESSOR                            **
       ********************************************************************/

      on("file:preprocessor", createBundler());

      /********************************************************************
       **                         BROWSERS                               **
       ********************************************************************/

      on("before:browser:launch", (browser = {}, launchOptions) => {
        //  Open dev tools in Chrome by default
        if (browser.name === "chrome" || browser.name === "chromium") {
          launchOptions.args.push("--auto-open-devtools-for-tabs");
        }

        // Start browsers with prefers-reduced-motion set to "reduce"
        if (browser.family === "firefox") {
          launchOptions.preferences["ui.prefersReducedMotion"] = 1;
        }

        if (browser.family === "chromium") {
          launchOptions.args.push("--force-prefers-reduced-motion");
        }

        return launchOptions;
      });

      /********************************************************************
       **                          CONFIG                                **
       ********************************************************************/

      if (!isQaDatabase) {
        config.excludeSpecPattern =
          "frontend/test/snapshot-creators/qa-db.cy.snap.js";
      }

      config.env.HAS_ENTERPRISE_TOKEN = hasEnterpriseToken;
      config.env.HAS_SNOWPLOW_MICRO = hasSnowplowMicro;
      config.env.SNOWPLOW_MICRO_URL = snowplowMicroUrl;
      config.env.SOURCE_VERSION = sourceVersion;
      config.env.TARGET_VERSION = targetVersion;

      return config;
    },
  },
});
