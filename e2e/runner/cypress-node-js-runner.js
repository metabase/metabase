const cypress = require("cypress");

const { FAILURE_EXIT_CODE } = require("./constants/exit-code");

/**
 * This simply runs Cypress through the Cypress Module API rather than the CLI.
 * See: https://docs.cypress.io/app/references/module-api
 *
 * @param {Partial<CypressCommandLine.CypressRunOptions> | Partial<CypressCommandLine.CypressOpenOptions>} options - Cypress configuration options for running or opening tests
 * @param {function(number): Promise<void>} exitFunction - Async function to call on exit with the exit code
 * @returns {Promise<CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult | void>}
 * @throws {Error} When Cypress fails to run tests
 */
const runCypress = async (options, exitFunction) => {
  const openMode = process.env.OPEN_UI === "true";

  try {
    const { status, message, totalFailed, failures } = openMode
      ? await cypress.open(options)
      : await cypress.run(options);

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
