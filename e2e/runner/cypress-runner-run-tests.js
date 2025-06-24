const cypress = require("cypress");

const { FAILURE_EXIT_CODE } = require("./constants/exit-code");
const { parseArguments, args } = require("./cypress-runner-utils");
const {
  SAMPLE_APP_SETUP_CONFIGS,
} = require("./sample-apps-shared/constants/sample-app-setup-configs");

const DEFAULT_PORT = 4000;
const getHost = (port = null) =>
  `http://localhost:${port ?? process.env.BACKEND_PORT ?? DEFAULT_PORT}`;

const getSampleAppE2eConfig = (suite) => ({
  [suite]: async () => {
    const { appName, env } = SAMPLE_APP_SETUP_CONFIGS[suite];
    const { CLIENT_PORT } = env;

    process.env = {
      ...process.env,
      ...env,
    };

    const defaultConfig = {
      browser: "chrome",
      project: ["e2e/tmp", appName].join("/"),
      configFile: "e2e/support/cypress.config.js",
      config: {
        // If the `CLIENT_PORT` is not set, it means we have multiple apps running on different ports,
        // so we control the `baseUrl` based on other `env` variables.
        baseUrl: CLIENT_PORT ? getHost(CLIENT_PORT) : "",
      },
      testingType: "e2e",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    const userArgs = await parseArguments(args);

    return Object.assign({}, defaultConfig, userArgs);
  },
});

// This is a map of all possible Cypress configurations we can run.
const configs = {
  e2e: async () => {
    const defaultConfig = {
      browser: "chrome",
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
  snapshot: async () => {
    // We only ever care about a browser out of all possible user arguments,
    // when it comes to the snapshot generation.
    // Anything else could result either in a failure or in a wrong database snapshot!
    const { browser } = await parseArguments(args);

    const snapshotConfig = {
      browser: browser ?? "chrome",
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
      browser: browser ?? "chrome",
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "component",
      openMode: args["--open"] || process.env.OPEN_UI === "true",
    };

    return sdkComponentConfig;
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
