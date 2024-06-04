import * as dbTasks from "./db_tasks";

const createBundler = require("@bahmutov/cypress-esbuild-preprocessor"); // This function is called when a project is opened or re-opened (e.g. due to the project's config changing)
const {
  NodeModulesPolyfillPlugin,
} = require("@esbuild-plugins/node-modules-polyfill");
const replay = require("@replayio/cypress");

const {
  removeDirectory,
  verifyDownloadTasks,
} = require("./commands/downloads/downloadUtils");

const isEnterprise = process.env["MB_EDITION"] === "ee";

const hasSnowplowMicro = process.env["MB_SNOWPLOW_AVAILABLE"];
const snowplowMicroUrl = process.env["MB_SNOWPLOW_URL"];

const isQaDatabase = process.env["QA_DB_ENABLED"];

const sourceVersion = process.env["CROSS_VERSION_SOURCE"];
const targetVersion = process.env["CROSS_VERSION_TARGET"];

const runWithReplay = process.env["CYPRESS_REPLAYIO_ENABLED"];
/**
 * CI coerces the value of this env var to a string (even if it's `false` or `0`!
 * Just omit it from any workflow that doesn't need to upload test recordings,
 * like we do in the `e2e-stress-test-flake-fix` workflow.
 */
const uploadReplayRecordings = !!process.env["CYPRESS_REPLAYIO_ENABLE_UPLOAD"];

const feHealthcheckEnabled = process.env["CYPRESS_FE_HEALTHCHECK"] === "true";

const convertStringToInt = string =>
  string.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

const defaultConfig = {
  // This is the functionality of the old cypress-plugins.js file
  setupNodeEvents(on, config) {
    // `on` is used to hook into various events Cypress emits
    // `config` is the resolved Cypress config
    /********************************************************************
     **                        PREPROCESSOR                            **
     ********************************************************************/

    if (runWithReplay) {
      on = replay.wrapOn(on);
      replay.default(on, config, {
        upload: uploadReplayRecordings,
        apiKey: process.env.REPLAY_API_KEY,
        filter: r => {
          const hasCrashed = r.status === "crashed";
          const hasFailed = r.metadata.test?.result === "failed";
          const isFlaky =
            r.metadata.test?.result === "passed" &&
            r.metadata.test.tests.some(r => r.result === "failed");
          const randomlyUploadAll =
            r.metadata.source.branch === "master" &&
            convertStringToInt(r.metadata.test.run.id) % 10 === 1;

          console.log("upload replay ::", {
            hasCrashed,
            hasFailed,
            isFlaky,
            randomlyUploadAll,
            branch: r.metadata.source.branch,
            result: r.metadata.test?.result,
            status: r.status,
            runId: r.metadata.test.run.id,
          });
          return hasCrashed || hasFailed || isFlaky || randomlyUploadAll;
        },
      });
    }

    on(
      "file:preprocessor",
      createBundler({
        loader: {
          ".svg": "text",
        },
        plugins: [NodeModulesPolyfillPlugin()],
        sourcemap: "inline",
      }),
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
    // Set on local, development-mode runs only
    config.env.feHealthcheck = {
      enabled: feHealthcheckEnabled,
      url: feHealthcheckEnabled
        ? "http://localhost:8080/webpack-dev-server/"
        : undefined,
    };

    require("@cypress/grep/src/plugin")(config);

    return config;
  },
  supportFile: "e2e/support/cypress.js",
  chromeWebSecurity: false,
  modifyObstructiveCode: false,
  // New `specPattern` is the combination of the old:
  //   1. testFiles and
  //   2. integrationFolder
  specPattern: "e2e/test/**/*.cy.spec.{js,ts}",
};

const mainConfig = {
  ...defaultConfig,
  projectId: "ywjy9z",
  viewportHeight: 800,
  viewportWidth: 1280,
  numTestsKeptInMemory: process.env["CI"] ? 1 : 50,
  reporter: "cypress-multi-reporters",
  reporterOptions: {
    configFile: false,
    // 🤯 mochawesome != cypress-mochawesome-reporter != mochaAwesome (this form does not exist) 🤯
    // See https://glebbahmutov.com/blog/the-awesome-battle/ to compare the first two.
    reporterEnabled: "mochawesome, mocha-junit-reporter",
    mochawesomeReporterOptions: {
      // https://github.com/adamgruber/mochawesome (NOT https://www.npmjs.com/package/cypress-mochawesome-reporter)
      reportDir: "cypress/reports/mochareports",
      reportFilename: "[status]-[name]",
      quiet: true,
      html: true,
      json: true,
    },
    // 🤯🤮mochaJunitReporterReporterOptions 🤮🤯
    // Exercise care when using this poorly documented key:
    // - https://stackoverflow.com/questions/51180963/cypress-tests-with-mocha-multi-reports-not-able-to-get-aggregated-results-for-a
    // - https://stackoverflow.com/questions/37965049/mocha-multi-reporter-with-junit
    // For the curious, ChatGPT 3.5 does NOT get it right
    mochaJunitReporterReporterOptions: {
      mochaFile: "./target/junit/[hash].xml",
      toConsole: false,
    },
  },
  retries: {
    runMode: 1,
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
  specPattern: "e2e/test/scenarios/cross-version/source/**/*.cy.spec.{js,ts}",
};

const crossVersionTargetConfig = {
  ...defaultConfig,
  baseUrl: "http://localhost:3001",
  specPattern: "e2e/test/scenarios/cross-version/target/**/*.cy.spec.{js,ts}",
};

const stressTestConfig = {
  ...defaultConfig,
  viewportHeight: 800,
  viewportWidth: 1280,
  retries: 0,
};

module.exports = {
  mainConfig,
  snapshotsConfig,
  stressTestConfig,
  crossVersionSourceConfig,
  crossVersionTargetConfig,
};
