/**
 * Extracts the <major> component from a Metabase version string.
 */
export function getMajorVersion(versionString: string): number | null {
  const regex =
    /v?(?<ossOrEE>\d+)\.?(?<major>\d+)?\.?(?<minor>\d+)?\.?(?<patch>\d+)?-?(?<label>\D+)?(?<build>\d+)?/;

  const result = regex.exec(versionString);

  if (!result || !result.groups) {
    return null;
  }

  const { major } = result.groups;

  return parseInt(major, 10) || null;
}
