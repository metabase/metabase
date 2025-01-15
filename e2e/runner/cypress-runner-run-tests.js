const cypress = require("cypress");

const { parseArguments, args } = require("./cypress-runner-utils");

const isOpenMode = args["--open"];

const runCypress = async (baseUrl, exitFunction = console.log) => {
  const defaultConfig = {
    browser: "chrome",
    configFile: "e2e/support/cypress.config.js",
    config: {
      baseUrl,
    },
  };

  const userArgs = await parseArguments(args);

  const finalConfig = Object.assign({}, defaultConfig, userArgs);

  try {
    const { status, message, totalFailed, failures } = isOpenMode
      ? await cypress.open(finalConfig)
      : await cypress.run(finalConfig);

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
