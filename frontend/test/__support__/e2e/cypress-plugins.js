// ***********************************************************
// This file can be used to load plugins and to register events.
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

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

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

const createBundler = require("@bahmutov/cypress-esbuild-preprocessor");

module.exports = (on, config) => {
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
    config.ignoreTestFiles = "qa-db.cy.snap.js";
  }

  config.env.HAS_ENTERPRISE_TOKEN = hasEnterpriseToken;
  config.env.HAS_SNOWPLOW_MICRO = hasSnowplowMicro;
  config.env.SNOWPLOW_MICRO_URL = snowplowMicroUrl;

  return config;
};
