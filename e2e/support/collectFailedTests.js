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
      const repoRoot = path.resolve(__dirname, "../..");
      const failedTestDir = path.join(repoRoot, "cypress", "test-results");
      const failedSpecsPath = path.join(failedTestDir, "failed-specs");

      fs.mkdirSync(failedTestDir, { recursive: true });
      fs.writeFileSync(failedSpecsPath, failedSpecs.join(","));
      console.log(
        `Saved ${failedSpecs.length} failed specs for retry: ${failedSpecs.join(", ")}`,
      );
    }
  });

  return collectFailingTests;
};

export { collectFailingTests };
