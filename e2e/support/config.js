import path from "node:path";

import cypressOnFix from "cypress-on-fix";
import installLogsPrinter from "cypress-terminal-report/src/installLogsPrinter";

import { BACKEND_HOST, BACKEND_PORT } from "../runner/constants/backend-port";

import * as ciTasks from "./ci_tasks";
import { collectFailingTests } from "./collectFailedTests";
import {
  copyDirectory,
  readDirectory,
  removeDirectory,
  verifyDownloadTasks,
} from "./commands/downloads/downloadUtils";
import webpackConfig from "./component-webpack.config";
import * as dbTasks from "./db_tasks";
import { signJwt } from "./helpers/e2e-jwt-tasks";

const createBundler = require("@bahmutov/cypress-esbuild-preprocessor"); // This function is called when a project is opened or re-opened (e.g. due to the project's config changing)
const {
  NodeModulesPolyfillPlugin,
} = require("@esbuild-plugins/node-modules-polyfill");
const cypressSplit = require("cypress-split");

const isEnterprise = process.env["MB_EDITION"] === "ee";
const isCI = !!process.env.CI;

const snowplowMicroUrl = process.env["MB_SNOWPLOW_URL"];

// docs say that tsconfig paths should handle aliases, but they don't
const assetsResolverPlugin = {
  name: "assetsResolver",
  setup(build) {
    // Redirect all paths starting with "assets/" to "resources/"
    build.onResolve({ filter: /^assets\// }, (args) => {
      return {
        path: path.join(
          __dirname,
          "../../resources/frontend_client/app",
          args.path,
        ),
      };
    });
  },
};

const defaultConfig = {
  // This is the functionality of the old cypress-plugins.js file
  setupNodeEvents(cypressOn, config) {
    // `on` is used to hook into various events Cypress emits
    // `config` is the resolved Cypress config

    // Use cypress-on-fix to enable multiple handlers
    const on = cypressOnFix(cypressOn);

    // CLI grep can't handle commas in the name
    // needed when we want to run only specific tests
    config.env.grep ??= process.env.GREP;

    // cypress-terminal-report
    if (isCI) {
      installLogsPrinter(on, {
        printLogsToConsole: "never",
      });
    }

    /********************************************************************
     **                        PREPROCESSOR                            **
     ********************************************************************/
    on(
      "file:preprocessor",
      createBundler({
        loader: {
          ".svg": "text",
        },
        plugins: [NodeModulesPolyfillPlugin(), assetsResolverPlugin],
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
        launchOptions.args.push("--blink-settings=preferredColorScheme=1");
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
      ...ciTasks,
      ...verifyDownloadTasks,
      readDirectory,
      copyDirectory,
      removeDirectory,
      signJwt,
    });

    /********************************************************************
     **                          CONFIG                                **
     ********************************************************************/

    // `grepIntegrationFolder` needs to point to the root!
    // See: https://github.com/cypress-io/cypress/issues/24452#issuecomment-1295377775
    config.env.grepIntegrationFolder = "../../";
    config.env.grepFilterSpecs = true;
    config.env.grepOmitFiltered = true;

    config.env.IS_ENTERPRISE = isEnterprise;
    config.env.SNOWPLOW_MICRO_URL = snowplowMicroUrl;

    require("@cypress/grep/src/plugin")(config);

    if (isCI) {
      cypressSplit(on, config);
      collectFailingTests(on, config);
    }

    return config;
  },
  baseUrl: `http://${BACKEND_HOST}:${BACKEND_PORT}`,
  defaultBrowser: process.env.CYPRESS_BROWSER ?? "chrome",
  env: {
    CI: isCI,
  },
  supportFile: "e2e/support/cypress.js",
  chromeWebSecurity: false,
  modifyObstructiveCode: false,
  // New `specPattern` is the combination of the old:
  //   1. testFiles and
  //   2. integrationFolder
  specPattern: "e2e/test/**/*.cy.spec.{js,ts}",
  viewportHeight: 800,
  viewportWidth: 1280,
  video: false,
};

const mainConfig = {
  ...defaultConfig,
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

const embeddingSdkComponentTestConfig = {
  ...defaultConfig,
  baseUrl: undefined, // baseUrl should not be set for component tests,
  defaultCommandTimeout: 10000,
  requestTimeout: 10000,
  video: false,
  specPattern: "e2e/test-component/scenarios/embedding-sdk/**/*.cy.spec.tsx",
  indexHtmlFile: "e2e/support/component-index.html",
  supportFile: "e2e/support/component-cypress.js",

  reporter: mainConfig.reporter,
  reporterOptions: mainConfig.reporterOptions,
  retries: mainConfig.retries,

  devServer: {
    framework: "react",
    bundler: "webpack",
    webpackConfig: webpackConfig,
  },
};

module.exports = {
  defaultConfig,
  mainConfig,
  embeddingSdkComponentTestConfig,
};
