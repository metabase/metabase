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

const path = require("path");
const fs = require("fs");
const readXlsxFile = require("read-excel-file/node");

module.exports = (on, config) => {
  // `on` is used to hook into various events Cypress emits
  // `config` is the resolved Cypress config

  /********************************************************************
   **                          WEBPACK                               **
   ********************************************************************/
  const { resolve } = require("../../webpack.config.js");
  const options = {
    webpackOptions: { resolve },
    watchOptions: {},
  };

  on("file:preprocessor", webpack(options));

  /********************************************************************
   **                       FILE DOWNLOADS                           **
   ********************************************************************/

  // place downloads into "metabase/downloads" folder
  const downloadDirectory = path.join(__dirname, "..", "..", "downloads");

  on("task", {
    // register utility tasks to clear the downloads folder,
    clearDownloads() {
      console.log("clearing folder %s", downloadDirectory);

      fs.rmdirSync(downloadDirectory, { recursive: true });

      return null;
    },

    // read and parse Excel files
    readExcelFile(filename) {
      // we must read the Excel file using Node library
      // and can return the parsed list to the browser
      // for the spec code to validate it
      console.log("reading Excel file %s", filename);
      console.log("from cwd %s", process.cwd());

      return readXlsxFile(filename);
    },
  });

  // https://on.cypress.io/browser-launch-api
  on("before:browser:launch", (browser, options) => {
    console.log("browser %o", browser);

    if (browser.family === "chromium" && browser.name !== "electron") {
      options.preferences.default["download"] = {
        default_directory: downloadDirectory,
      };

      return options;
    }

    if (browser.family === "firefox") {
      options.preferences["browser.download.dir"] = downloadDirectory;
      options.preferences["browser.download.folderList"] = 2;

      // needed to prevent download prompt for text/csv and Excel files
      // grab the Excel MIME types by downloading the files in Excel and observing
      // the reported MIME content types in the Developer Toos
      options.preferences["browser.helperApps.neverAsk.saveToDisk"] =
        "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      return options;
    }
  });
};
