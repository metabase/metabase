const cypress = require("cypress");

const { parseArguments, args } = require("./cypress-runner-utils");

const getConfig = baseUrl => {
  return {
    browser: "chrome",
    configFile: "e2e/support/cypress-snapshots.config.js",
    config: {
      baseUrl,
    },
  };
};

const generateSnapshots = async (baseUrl, exitFunction) => {
  // We only ever care about a broswer out of all possible user arguments,
  // when it comes to the snapshot generation.
  // Anything else could result either in a failure or in a wrong database snapshot!
  const { browser } = await parseArguments(args);
  const customBrowser = browser ? { browser } : null;

  const baseConfig = getConfig(baseUrl);
  const snapshotConfig = Object.assign({}, baseConfig, customBrowser);

  try {
    const { status, message, totalFailed, failures } = await cypress.run(
      snapshotConfig,
    );

    // At least one test failed. We can't continue to the next step.
    // Cypress tests rely on snapshots correctly generated at this stage.
    if (totalFailed > 0) {
      await exitFunction(1);
    }

    // Something went wrong and Cypress failed to even run tests
    if (status === "failed" && failures) {
      console.error(message);

      await exitFunction(failures);
    }
  } catch (e) {
    console.error("Unable to generate snapshots!\n", e);

    await exitFunction(1);
  }
};

module.exports = generateSnapshots;
