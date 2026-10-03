// This script is used in .github/workflows/cross-version.yml
// to generate a matrix for cross-version migration testing

/**
 * Generate a CI matrix for cross-version migration testing (EE only).
 *
 * Creates pairs of [source, target] for testing HEAD against every in-support
 * major version, in both upgrade and downgrade directions.
 *
 * The caller supplies the supported majors — in CI that comes from
 * `getSupportedMajors()`, which reads `major_version_support` from
 * version-info.json and keeps the lines whose `eol` is today or later. That is
 * the same source auto-backport and schedule-minor use, so a major drops out of
 * this matrix on the day it stops being a backport target.
 *
 * @param {number[]} supportedMajors - In-support major version numbers (e.g. [59, 58, 56])
 * @returns {{ config: Array<{ source: string, target: string }> }}
 *
 * @example
 * buildCrossVersionMatrix([59, 58, 56])
 * // Returns:
 * // {
 * //   config: [
 * //     { source: "HEAD", target: "v1.59.x" },
 * //     { source: "v1.59.x", target: "HEAD" },
 * //     { source: "HEAD", target: "v1.58.x" },
 * //     { source: "v1.58.x", target: "HEAD" },
 * //     { source: "HEAD", target: "v1.56.x" },
 * //     { source: "v1.56.x", target: "HEAD" },
 * //   ]
 * // }
 */
function buildCrossVersionMatrix(supportedMajors) {
  if (!Array.isArray(supportedMajors) || supportedMajors.length === 0) {
    throw new Error(
      `Invalid supportedMajors: ${JSON.stringify(supportedMajors)}. Must be a non-empty array of positive integers.`,
    );
  }

  // findIndex rather than find, so an `undefined` entry is still reported.
  const invalidIndex = supportedMajors.findIndex(
    (majorVersion) => !Number.isInteger(majorVersion) || majorVersion < 1,
  );

  if (invalidIndex !== -1) {
    throw new Error(
      `Invalid major version: ${supportedMajors[invalidIndex]}. Must be a positive integer.`,
    );
  }

  // Newest first, so the most recently released major is tested first and a
  // duplicated line in version-info.json can't double the matrix.
  const majors = [...new Set(supportedMajors)].sort((a, b) => b - a);

  const config = majors.flatMap((majorVersion) => {
    const version = `v1.${majorVersion}.x`;
    return [
      { source: "HEAD", target: version },
      { source: version, target: "HEAD" },
    ];
  });

  return { config };
}

module.exports = { buildCrossVersionMatrix };
