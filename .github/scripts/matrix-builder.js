/**
 * @typedef {Object} TestConfig
 * @property {string} name - Name of the test configuration
 * @property {string} [edition] - Edition of the test (ee/oss)
 * @property {string} [tags] - Cypress tags to filter tests
 * @property {string} specs - Glob pattern for test specs
 */

/**
 * @typedef {Object} MatrixConfig
 * @property {string} name - Name of the test group
 * @property {string} [specs] - Specific specs to run
 * @property {string} java-version - Java version to use
 * @property {string} runner - Runner to use
 * @property {string} edition - Edition to use
 */

/**
 * @typedef {Object} DefaultOptions
 * @property {number} java-version - Java version to use
 * @property {string} runner - Runner to use
 * @property {string} edition - Edition to use
 */

/**
 * Builds a matrix configuration for E2E tests
 * @param {Object} options
 * @param {number} options.chunks - Number of chunks to split tests into
 * @param {string} options.specs - Glob pattern for test specs
 * @param {DefaultOptions} [options.defaultOptions] - Default options for matrix configuration
 * @returns {{matrix: {include: MatrixConfig[]}, regularChunks: number}}
 */
function buildMatrix({
  chunks,
  specs = "./e2e/test/scenarios/**/*.cy.spec.*",
  defaultOptions = {
    "java-version": 21,
    runner: "ubuntu-22.04",
    edition: "ee",
  },
}) {
  const SPECS_PER_CHUNK = 5; // number of specs per chunk when running specific specs
  const isDefaultSpecPattern = specs === "./e2e/test/scenarios/**/*.cy.spec.*";

  // Helper to get count of matching specs for a pattern
  const getMatchingSpecsCount = (pattern) => {
    const { globSync } = require("node:fs");
    return globSync(pattern).length;
  };

  // Helper to check if specs exist for a pattern
  const hasMatchingSpecs = (pattern) => getMatchingSpecsCount(pattern) > 0;

  // Define special test configurations and filter out those without matching specs
  const specialTestConfigs = [
    {
      name: "embedding-sdk",
      specs: "./e2e/test/scenarios/embedding-sdk/**.cy.spec.*",
    },
    { name: "oss-subset", edition: "oss", tags: "@OSS @smoke+-@EE", specs },
    { name: "mongo", tags: "@mongo", specs },
  ];

  // Filter special tests based on matching specs
  const specialTests = specialTestConfigs.filter((test) =>
    hasMatchingSpecs(test.specs),
  );

  // Calculate chunks based on whether we're running all tests or specific ones
  let regularChunks;

  if (isDefaultSpecPattern) {
    // For default pattern, use input chunks minus special tests
    regularChunks = chunks - specialTests.length;
  } else {
    // For specific specs, calculate based on number of matching files
    const matchingSpecsCount = getMatchingSpecsCount(specs);
    regularChunks = Math.max(
      1,
      Math.ceil(matchingSpecsCount / SPECS_PER_CHUNK),
    );
  }

  // Create regular test chunks
  const regularTests = new Array(regularChunks).fill(1).map((_, index) => ({
    name: `e2e-group-${index + 1}`,
    ...(!isDefaultSpecPattern && { specs }),
  }));

  // Combine regular and special tests if special tests exist
  const testSets =
    specialTests.length > 0 ? [...regularTests, ...specialTests] : regularTests;

  const config = testSets.map((options) => ({
    ...defaultOptions,
    ...options,
  }));

  return {
    matrix: { include: config },
    regularChunks,
  };
}

module.exports = { buildMatrix };
