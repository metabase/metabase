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
  process.env["ENTERPRISE_TOKEN"] && process.env["MB_EDITION"] === "ee";

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)
const webpack = require("@cypress/webpack-preprocessor");
const { resolve } = require("../../../../webpack.config.js");

const webpackPluginOptions = {
  webpackOptions: { resolve },
  watchOptions: {},
};

module.exports = (on, config) => {
  // `on` is used to hook into various events Cypress emits
  // `config` is the resolved Cypress config

  /********************************************************************
   **                          WEBPACK                               **
   ********************************************************************/

  on("file:preprocessor", webpack(webpackPluginOptions));

  /********************************************************************
   **                         BROWSERS                               **
   ********************************************************************/

  //  Open dev tools in Chrome by default
  on("before:browser:launch", (browser = {}, launchOptions) => {
    if (browser.name === "chrome" || browser.name === "chromium") {
      launchOptions.args.push("--auto-open-devtools-for-tabs");

      return launchOptions;
    }
  });

  /********************************************************************
   **                          CONFIG                                **
   ********************************************************************/

  config.env.HAS_ENTERPRISE_TOKEN = hasEnterpriseToken;

  return config;
};
