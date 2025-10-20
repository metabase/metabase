/**
 * @typedef {Object} BlockedTestsConfig
 * @property {string} version - The version of the config object.
 * @property {Object} ignored - Object containing lists of ignored tests.
 * @property {string[]} [ignored.vars] - Array of blocked test identifiers (e.g., integration/unit test names).
 * @property {string[]} [ignored.cypress] - Array of blocked Cypress test names.
 * @property {Object} [metadata] - Metadata about the config.
 * @property {string} [metadata.last_updated] - ISO date string of last update.
 * @property {string} [metadata.updated_by] - GitHub username of the person who last updated.
 * @property {string} [metadata.reason] - Reason for blocking the tests.
 */

/**
 * Build a list of blocked Cypress tests from a ci test config.
 * 
 * @param {BlockedTestsConfig} config
 * @returns {string} A semicolon-separated string of blocked Cypress tests, each prefixed with a hyphen.
 */
function getBlockedCypressTests(config = {}) {
  const skipped = config?.ignored?.cypress || [];

  if (!Array.isArray(skipped)) {
    throw new Error(
      "Blocked Cypress tests must be stored as an array of strings!",
    );
  }

  const escapeQuotes = (s) => s.replace(/"/g, '\\"');
  const toPrefixed = (s) => `-${s.trim()}`;

  return skipped.map((t) => toPrefixed(escapeQuotes(t))).join(";");
}

module.exports = {
  getBlockedCypressTests,
};
