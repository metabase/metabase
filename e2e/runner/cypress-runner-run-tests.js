const cypress = require("cypress");

const { FAILURE_EXIT_CODE } = require("./constants/exit-code");
const { parseArguments } = require("./cypress-runner-utils");

const DEFAULT_PORT = 4000;
const getHost = () =>
  `http://localhost:${process.env.BACKEND_PORT ?? DEFAULT_PORT}`;

// This is a map of all possible Cypress configurations we can run.
const configs = {
  e2e: async () => {
    const { rawArguments, parsedArguments } = await parseArguments();
    const isOpenMode = rawArguments["--open"];

    const defaultConfig = {
      browser: "chrome",
      configFile: "e2e/support/cypress.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "e2e",
      openMode: isOpenMode || process.env.OPEN_UI === "true",
    };

    const finalConfig = Object.assign({}, defaultConfig, parsedArguments);
    return finalConfig;
  },
  "sample-apps-embedding-sdk-e2e": async () => {
    const { rawArguments, parsedArguments } = await parseArguments();
    const isOpenMode = rawArguments["--open"];

    const defaultConfig = {
      browser: "chrome",
      configFile: "e2e/support/cypress-sample-apps-embedding-sdk-e2e.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "e2e",
      openMode: isOpenMode || process.env.OPEN_UI === "true",
    };

    return Object.assign({}, defaultConfig, parsedArguments);
  },
  snapshot: async () => {
    // We only ever care about a browser out of all possible user arguments,
    // when it comes to the snapshot generation.
    // Anything else could result either in a failure or in a wrong database snapshot!
    const {
      parsedArguments: { browser },
    } = await parseArguments();

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
    const {
      rawArguments,
      parsedArguments: { browser },
    } = await parseArguments();
    const isOpenMode = rawArguments["--open"];

    const sdkComponentConfig = {
      browser: browser ?? "chrome",
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      config: {
        baseUrl: getHost(),
      },
      testingType: "component",
      openMode: isOpenMode || process.env.OPEN_UI === "true",
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
