import * as dbTasks from "./db_tasks";
const replay = require("@replayio/cypress");
const { verifyDownloadTasks } = require("cy-verify-downloads");
const {
  NodeModulesPolyfillPlugin,
} = require("@esbuild-plugins/node-modules-polyfill");

const isEnterprise = process.env["MB_EDITION"] === "ee";

const hasSnowplowMicro = process.env["MB_SNOWPLOW_AVAILABLE"];
const snowplowMicroUrl = process.env["MB_SNOWPLOW_URL"];

const isQaDatabase = process.env["QA_DB_ENABLED"];

const sourceVersion = process.env["CROSS_VERSION_SOURCE"];
const targetVersion = process.env["CROSS_VERSION_TARGET"];

const runWithReplay = process.env["CYPRESS_REPLAYIO_ENABLED"];

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

const createBundler = require("@bahmutov/cypress-esbuild-preprocessor");
const {
  removeDirectory,
} = require("./commands/downloads/deleteDownloadsFolder");

const defaultConfig = {
  // This is the functionality of the old cypress-plugins.js file
  setupNodeEvents(on, config) {
    // Cypress analytics and the alternative to Cypress dashboard
    // Needs to be at the very top in the config!
    [on, config] = require("@deploysentinel/cypress-debugger/plugin")(
      on,
      config,
    );

    // `on` is used to hook into various events Cypress emits
    // `config` is the resolved Cypress config
    /********************************************************************
     **                        PREPROCESSOR                            **
     ********************************************************************/

    on(
      "file:preprocessor",
      createBundler({ plugins: [NodeModulesPolyfillPlugin()] }),
    );

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
     **                           TASKS                                **
     ********************************************************************/
    on("task", {
      log(...messages) {
        console.log(...messages);
        return null; // tasks must have a return value
      },
      ...dbTasks,
      ...verifyDownloadTasks,
      removeDirectory,
    });

    /********************************************************************
     **                          CONFIG                                **
     ********************************************************************/

    if (!isQaDatabase) {
      config.excludeSpecPattern = "e2e/snapshot-creators/qa-db.cy.snap.js";
    }

    // `grepIntegrationFolder` needs to point to the root!
    // See: https://github.com/cypress-io/cypress/issues/24452#issuecomment-1295377775
    config.env.grepIntegrationFolder = "../../";
    config.env.grepFilterSpecs = true;

    config.env.IS_ENTERPRISE = isEnterprise;
    config.env.HAS_SNOWPLOW_MICRO = hasSnowplowMicro;
    config.env.SNOWPLOW_MICRO_URL = snowplowMicroUrl;
    config.env.SOURCE_VERSION = sourceVersion;
    config.env.TARGET_VERSION = targetVersion;

    require("@cypress/grep/src/plugin")(config);

    if (runWithReplay) {
      replay.default(on, config, {
        upload: true,
        apiKey: process.env.REPLAY_API_KEY,
      });
    }

    return config;
  },
  supportFile: "e2e/support/cypress.js",
  videoUploadOnPasses: false,
  chromeWebSecurity: false,
  modifyObstructiveCode: false,
  // New `specPattern` is the combination of the old:
  //   1. testFiles and
  //   2. integrationFolder
  specPattern: "e2e/test/**/*.cy.spec.js",
};

const mainConfig = {
  ...defaultConfig,
  viewportHeight: 800,
  viewportWidth: 1280,
  numTestsKeptInMemory: process.env["CI"] ? 1 : 50,
  reporter: "mochawesome",
  reporterOptions: {
    reportDir: "cypress/reports/mochareports",
    reportFilename: "[status]-[name]",
    quiet: true,
    html: false,
    json: true,
  },
  retries: {
    runMode: 2,
    openMode: 0,
  },
};

const snapshotsConfig = {
  ...defaultConfig,
  specPattern: "e2e/snapshot-creators/**/*.cy.snap.js",
};

const crossVersionSourceConfig = {
  ...defaultConfig,
  baseUrl: "http://localhost:3000",
  specPattern: "e2e/test/scenarios/cross-version/source/**/*.cy.spec.js",
};

const crossVersionTargetConfig = {
  ...defaultConfig,
  baseUrl: "http://localhost:3001",
  specPattern: "e2e/test/scenarios/cross-version/target/**/*.cy.spec.js",
};

const stressTestConfig = {
  ...defaultConfig,
  retries: 0,
};

module.exports = {
  mainConfig,
  snapshotsConfig,
  stressTestConfig,
  crossVersionSourceConfig,
  crossVersionTargetConfig,
};
