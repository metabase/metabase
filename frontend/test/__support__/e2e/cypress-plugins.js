// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)
const webpack = require("@cypress/webpack-preprocessor");

module.exports = (on, config) => {
  // `on` is used to hook into various events Cypress emits
  // `config` is the resolved Cypress config

  /********************************************************************
   **                          WEBPACK                               **
   ********************************************************************/
  const { resolve } = require("../../../../webpack.config.js");
  const options = {
    webpackOptions: { resolve },
    watchOptions: {},
  };

  on("file:preprocessor", webpack(options));

  /********************************************************************
   **                         BROWSERS                               **
   ********************************************************************/

  //  Open dev tools in Chrome by default
  on("before:browser:launch", (browser = {}, launchOptions) => {
    if (browser.name === "chrome") {
      launchOptions.args.push("--auto-open-devtools-for-tabs");

      return launchOptions;
    }
  });
};
