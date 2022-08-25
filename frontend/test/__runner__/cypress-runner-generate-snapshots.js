const cypress = require("cypress");

const getConfig = baseUrl => {
  return {
    browser: "chrome",
    configFile: "frontend/test/__support__/e2e/cypress-snapshots.json",
    config: {
      baseUrl,
    },
  };
};

const generateSnapshots = async (baseUrl, exitFunction) => {
  const snapshotConfig = getConfig(baseUrl);

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
