import fs from "fs";
import path from "path";

import { booleanify } from "./cypress-runner-utils";

const cypress = require("cypress");

const cypressEnvPath = path.join(__dirname, "../../cypress.env.json");
const cypressEnv = JSON.parse(fs.readFileSync(cypressEnvPath, "utf8"));

Object.entries(booleanify(cypressEnv)).forEach(([key, value]) => {
  process.env[key] = String(value);
});

console.log(process.env);

const { BACKEND_PORT } = require("./constants/backend-port");
const { FAILURE_EXIT_CODE } = require("./constants/exit-code");
const { parseArguments, args } = require("./cypress-runner-utils");
const {
  HOST_APP_SETUP_CONFIGS,
} = require("./embedding-sdk/host-apps/constants/host-app-setup-configs");
const {
  SAMPLE_APP_SETUP_CONFIGS,
} = require("./embedding-sdk/sample-apps/constants/sample-app-setup-configs");

const getHost = (port = BACKEND_PORT) => `http://localhost:${port}`;

const getEmbeddingSdkAppE2eConfig = async ({
  baseUrl,
  env,
  project,
  specPattern,
}) => {
  process.env = {
    ...process.env,
    ...env,
  };

  const defaultConfig = {
    browser: process.env.CYPRESS_BROWSER ?? "chrome",
    project,
    configFile: "e2e/support/cypress.config.js",
    config: {
      baseUrl,
      specPattern,
      env,
    },
    testingType: "e2e",
    openMode: args["--open"] || process.env.OPEN_UI === "true",
  };

  const userArgs = await parseArguments(args);

  return Object.assign({}, defaultConfig, userArgs);
};

const getSampleAppE2eConfig = (suite) => ({
  [suite]: async () => {
    const { appName, env } = SAMPLE_APP_SETUP_CONFIGS[suite];
    const { CLIENT_PORT } = env;

    return getEmbeddingSdkAppE2eConfig({
      // If the `clientPort` is not set, it means we have multiple apps running on different ports,
      // so we control the `baseUrl` based on other `env` variables on the Sample App tests level.
      baseUrl: CLIENT_PORT ? getHost(CLIENT_PORT) : "",
      env,
      project: ["e2e/tmp", appName].join("/"),
    });
  },
});

const getHostAppE2eConfig = (suite) => ({
  [suite]: async () => {
    const { appName, env } = HOST_APP_SETUP_CONFIGS[suite];

    return getEmbeddingSdkAppE2eConfig({
      baseUrl: getHost(),
      env,
      specPattern: [
        "e2e/test-host-app/shared/**/*.cy.spec.{js,ts}",
        ["e2e/test-host-app", appName, "**/*.cy.spec.{js,ts}"].join("/"),
      ],
    });
  },
});

// This is a map of all possible Cypress configurations we can run.
const configs = {
  e2e: async () => {
    const defaultConfig = {
      browser: process.env.CYPRESS_BROWSER ?? "chrome",
      configFile: "e2e/support/cypress.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);

    const finalConfig = Object.assign({}, defaultConfig, userArgs);
    return finalConfig;
  },
  ...getSampleAppE2eConfig("metabase-nodejs-react-sdk-embedding-sample-e2e"),
  ...getSampleAppE2eConfig("metabase-nextjs-sdk-embedding-sample-e2e"),
  ...getSampleAppE2eConfig("shoppy-e2e"),
  ...getHostAppE2eConfig("vite-6-host-app-e2e"),
  ...getHostAppE2eConfig("next-15-app-router-host-app-e2e"),
  ...getHostAppE2eConfig("next-15-pages-router-host-app-e2e"),
  ...getHostAppE2eConfig("angular-20-host-app-e2e"),
  snapshot: async () => {
    // We only ever care about a browser out of all possible user arguments,
    // when it comes to the snapshot generation.
    // Anything else could result either in a failure or in a wrong database snapshot!
    const { browser } = await parseArguments(args);

    const snapshotConfig = {
      browser: browser ?? process.env.CYPRESS_BROWSER ?? "chrome",
      configFile: "e2e/support/cypress-snapshots.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "e2e",
      openMode: false,
    };

    return snapshotConfig;
  },
  component: async () => {
    const { browser } = await parseArguments(args);

    const sdkComponentConfig = {
      browser: browser ?? process.env.CYPRESS_BROWSER ?? "chrome",
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "component",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);

    const finalConfig = Object.assign({}, sdkComponentConfig, userArgs);
    return finalConfig;
  },
};

/**
 * This simply runs cypress through the javascript API rather than the CLI, and
 * lets us conditionally load a config file and some other options along with it.
 */
const runCypress = async (suite = "e2e", exitFunction) => {
  if (!configs[suite]) {
    console.error(
      `Invalid suite: ${suite}, try one of: ${Object.keys(configs)}`,
    );
    await exitFunction(FAILURE_EXIT_CODE);
  }

  const config = await configs[suite]();

  try {
    const { status, message, totalFailed, failures } = config.openMode
      ? await cypress.open(config)
      : await cypress.run(config);

    // At least one test failed
    if (totalFailed > 0) {
      await exitFunction(FAILURE_EXIT_CODE);
    }

    // Something went wrong and Cypress failed to even run tests
    if (status === "failed" && failures) {
      console.error(message);

      await exitFunction(failures);
    }
  } catch (e) {
    console.error("Failed to run Cypress!\n", e);

    await exitFunction(FAILURE_EXIT_CODE);
  }
};

module.exports = runCypress;
