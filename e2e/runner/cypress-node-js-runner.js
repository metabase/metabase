const cypress = require("cypress");

/**
 * Runs Cypress through the Module API and throws on any failure.
 * See: https://docs.cypress.io/app/references/module-api
 *
 * Errors are propagated to the parent process rather than handled here.
 * The caller is responsible for catching errors and performing cleanup.
 *
 * This wrapper exists because cypress.run() resolves successfully even when
 * tests fail - it only throws when Cypress itself fails to start (e.g., invalid
 * config). We convert test failures into thrown errors for consistent handling.
 *
 * @param {Partial<CypressCommandLine.CypressRunOptions> | Partial<CypressCommandLine.CypressOpenOptions>} options - Cypress configuration options
 * @returns {Promise<CypressCommandLine.CypressRunResult>} - Resolves with results if all tests pass
 * @throws {Error} When Cypress fails to run (e.g., config error) or any tests fail
 */
const runCypress = async (options) => {
  const openMode = process.env.CYPRESS_GUI === "true";

  // Open mode is interactive - no results to validate
  if (openMode) {
    await cypress.open(options);
    return;
  }

  const result = await cypress.run(options);

  // Cypress failed to even run tests (e.g., config error, browser crash)
  if (result.status === "failed") {
    throw new Error(`Cypress failed to run: ${result.message}`);
  }

  // Tests ran but at least one failed
  if (result.totalFailed > 0) {
    throw new Error(`${result.totalFailed} test(s) failed`);
  }

  return result;
};

module.exports = runCypress;
