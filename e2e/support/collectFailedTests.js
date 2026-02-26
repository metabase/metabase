const fs = require("fs");
const path = require("path");

/**
 * Escapes special regex characters in a string
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Collects failed test specs and individual test names from the most recent Cypress test run
 *
 * After each run, files will store:
 * - `failed-specs`: spec paths as comma-separated list (for --spec flag)
 * - `failed-tests`: individual test names as regex pattern (for --env grep)
 *
 * Using both allows retry to load only failed spec files AND run only failed tests,
 * making retries much faster than re-running entire specs.
 *
 * @param {*} on
 * @param {*} config
 * @returns
 */
const collectFailingTests = (on, config) => {
  on("after:run", async (results) => {
    const failedSpecs = [];
    const failedTestNames = [];

    for (const run of results.runs) {
      if (run.stats.failures > 0) {
        failedSpecs.push(run.spec.relative);

        // Collect individual failed test names
        for (const test of run.tests) {
          if (test.state === "failed") {
            // test.title is an array: ["describe", "nested describe", "it block"]
            // Use the full title path for unique matching
            const fullTitle = test.title.join(" ");
            failedTestNames.push(fullTitle);
          }
        }
      }
    }

    if (failedSpecs.length > 0) {
      const failedTestFilePath = "../../cypress/test-results/";
      fs.mkdirSync(failedTestFilePath, { recursive: true });

      // Write failed spec paths (backward compatible)
      fs.writeFileSync(
        path.join(failedTestFilePath, "failed-specs"),
        failedSpecs.join(","),
      );

      // Write failed test names as grep-compatible regex pattern
      if (failedTestNames.length > 0) {
        // Escape regex special chars and join with | for OR matching
        const grepPattern = failedTestNames.map(escapeRegex).join("|");
        fs.writeFileSync(
          path.join(failedTestFilePath, "failed-tests"),
          grepPattern,
        );
      }
    }
  });

  return collectFailingTests;
};

export { collectFailingTests };
