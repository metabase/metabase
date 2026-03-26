// This script is used in .github/workflows/cross-version.yml
// to generate a matrix for cross-version migration testing

/**
 * Generate a CI matrix for cross-version migration testing (EE only).
 *
 * Creates pairs of [source, target] for testing HEAD against the last N
 * minor versions in both upgrade and downgrade directions.
 *
 * @param {number} currentVersion - The current major version number (e.g., 59)
 * @param {number} count - Number of previous minor versions to test against (default: 3)
 * @returns {{ config: Array<{ source: string, target: string }> }}
 *
 * @example
 * buildMatrix(59)
 * // Returns:
 * // {
 * //   config: [
 * //     { source: "HEAD", target: "v1.59.x" },
 * //     { source: "v1.59.x", target: "HEAD" },
 * //     { source: "HEAD", target: "v1.58.x" },
 * //     { source: "v1.58.x", target: "HEAD" },
 * //     { source: "HEAD", target: "v1.57.x" },
 * //     { source: "v1.57.x", target: "HEAD" },
 * //   ]
 * // }
 */
function buildCrossVersionMatrix(currentVersion, count = 3) {
  if (!Number.isInteger(currentVersion) || currentVersion < 1) {
    throw new Error(
      `Invalid currentVersion: ${currentVersion}. Must be a positive integer.`,
    );
  }

  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Invalid count: ${count}. Must be a positive integer.`);
  }

  const config = Array.from({ length: count }, (_, i) => currentVersion - i)
    .filter((majorVersion) => majorVersion >= 1)
    .flatMap((majorVersion) => {
      const version = `v1.${majorVersion}.x`;
      return [
        { source: "HEAD", target: version },
        { source: version, target: "HEAD" },
      ];
    });

  return { config };
}

module.exports = { buildCrossVersionMatrix };
