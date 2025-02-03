const cypress = require("cypress");

const { parseArguments, args } = require("./cypress-runner-utils");

const getTestConfig = async () => {
  const defaultConfig = {
    browser: "chrome",
    configFile: "e2e/support/cypress.config.js",
    config: {
      baseUrl: `http://localhost:${process.env.BACKEND_PORT}`,
    },
    testingType: process.env.TEST_SUITE,
    openMode: args["--open"] || process.env.OPEN_UI,
  };

  const userArgs = await parseArguments(args);
  const finalConfig = Object.assign({}, defaultConfig, userArgs);
  return finalConfig;
};

const getSnapshotConfig = async () => {
  // We only ever care about a browser out of all possible user arguments,
  // when it comes to the snapshot generation.
  // Anything else could result either in a failure or in a wrong database snapshot!
  const { browser } = await parseArguments(args);

  const snapshotConfig = {
    browser: browser ?? "chrome",
    configFile: "e2e/support/cypress-snapshots.config.js",
    config: {
      baseUrl: `http://localhost:${process.env.BACKEND_PORT}`,
    },
    testingType: "e2e",
    openMode: false,
  };

  return snapshotConfig;
};

const runCypress = async (mode = "test", exitFunction = process.exit) => {
  const config = await (mode === "snapshot"
    ? getSnapshotConfig()
    : getTestConfig());

  try {
    const { status, message, totalFailed, failures } = config.openMode
      ? await cypress.open(config)
      : await cypress.run(config);

    // At least one test failed
    if (totalFailed > 0) {
      await exitFunction(1);
    }

    // Something went wrong and Cypress failed to even run tests
    if (status === "failed" && failures) {
      console.error(message);

      await exitFunction(failures);
    }
  } catch (e) {
    console.error("Failed to run Cypress!\n", e);

    await exitFunction(1);
  }
};

module.exports = runCypress;
