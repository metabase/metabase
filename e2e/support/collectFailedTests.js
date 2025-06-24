const fs = require("fs");

const path = require("path");

/**
 * Collects failed test specs from the most recent Cypress test run
 *
 * After each run, a file will store failed spec paths as a comma-separated list
 * This format matches what's needed by the GitHub workflow for retrying tests
 *
 * @param {*} on
 * @param {*} config
 * @returns
 */
const collectFailingTests = (on, config) => {
  on("after:run", async (results) => {
    const failedSpecs = results.runs
      .filter((run) => run.stats.failures > 0)
      .map((run) => run.spec.relative);

    if (failedSpecs.length > 0) {
      const failedTestFilePath = "../../cypress/test-results/";
      fs.mkdirSync(failedTestFilePath, { recursive: true });
      fs.writeFileSync(
        path.join(failedTestFilePath, "failed-specs"),
        failedSpecs.join(","),
      );
    }
  });

  return collectFailingTests;
};

export { collectFailingTests };
