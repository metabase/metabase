/**
 * Version helpers for cross-version migration testing.
 *
 * These extend the core version-helpers with support for:
 * - HEAD (unreleased builds from the current branch)
 * - Rolling .x tags (e.g., v1.59.x)
 *
 * These concepts don't exist in regular release tooling, so they're isolated here.
 * This file can import from version-helpers, but not vice versa.
 */
import {
  getMajorVersion as getReleaseMajorVersion,
  isEnterpriseVersion,
  isValidVersionString,
  versionSort,
} from "./version-helpers";

export type VersionComparisonResult = "upgrade" | "downgrade" | "same";

// ============================================================================
// Predicates
// ============================================================================

export const isHead = (version: string): boolean => version === "HEAD";

export const isRollingTag = (version: string): boolean => version.endsWith(".x");

// ============================================================================
// Pure helpers for HEAD versions
// ============================================================================

/** Given the current major version, returns the next major version (HEAD). */
export const getHeadMajorVersion = (currentVersion: string): string => {
  if (!currentVersion) {
    throw new Error("currentVersion is required");
  }
  return String(Number(currentVersion) + 1);
};

/** Docker image for HEAD builds. */
export const HEAD_DOCKER_IMAGE = "metabase/metabase-enterprise-head:latest";

// ============================================================================
// Pure helpers for rolling .x tags
// ============================================================================

/** Extract major version from a rolling tag like v1.59.x */
export const getRollingTagMajorVersion = (version: string): string => {
  const match = version.match(/v\d+\.(\d+)\.x$/);
  if (!match) {
    throw new Error(`Invalid rolling tag: ${version}`);
  }
  return match[1];
};

/** Check if a rolling tag is enterprise edition (v1.x.x) */
export const isRollingTagEnterprise = (version: string): boolean =>
  version.startsWith("v1.");

// ============================================================================
// Composed helpers (exported for use by CLI)
// ============================================================================

/**
 * Get the major version number from a version string.
 * Supports HEAD and rolling .x tags.
 */
export const getMajorVersion = (version: string): string => {
  if (isHead(version)) {
    const currentVersion = process.env.CURRENT_VERSION;
    if (!currentVersion) {
      throw new Error("CURRENT_VERSION env var must be set when using HEAD");
    }
    return getHeadMajorVersion(currentVersion);
  }

  if (isRollingTag(version)) {
    return getRollingTagMajorVersion(version);
  }

  return getReleaseMajorVersion(version);
};

/**
 * Compare two versions to determine upgrade/downgrade direction.
 * Supports HEAD and rolling .x tags.
 */
export const compareVersions = (
  source: string,
  target: string,
): VersionComparisonResult => {
  // HEAD is always newer than any released version
  if (isHead(source) && isHead(target)) {
    return "same";
  }
  if (isHead(source)) {
    return "downgrade";
  }
  if (isHead(target)) {
    return "upgrade";
  }

  // Rolling tags - compare by major version only
  if (isRollingTag(source) || isRollingTag(target)) {
    const sourceMajor = isRollingTag(source)
      ? parseInt(getRollingTagMajorVersion(source), 10)
      : parseInt(getReleaseMajorVersion(source), 10);
    const targetMajor = isRollingTag(target)
      ? parseInt(getRollingTagMajorVersion(target), 10)
      : parseInt(getReleaseMajorVersion(target), 10);

    if (sourceMajor < targetMajor) {
      return "upgrade";
    }
    if (sourceMajor > targetMajor) {
      return "downgrade";
    }
    return "same";
  }

  // Regular versions - validate and compare
  if (!isValidVersionString(source)) {
    throw new Error(`Invalid version string: ${source}`);
  }
  if (!isValidVersionString(target)) {
    throw new Error(`Invalid version string: ${target}`);
  }

  const result = versionSort(source, target);
  if (result < 0) {
    return "upgrade";
  }
  if (result > 0) {
    return "downgrade";
  }
  return "same";
};

/**
 * Get the Docker image for a version.
 * Supports HEAD and rolling .x tags.
 */
export const getDockerImage = (version: string): string => {
  if (isHead(version)) {
    return HEAD_DOCKER_IMAGE;
  }

  if (!isRollingTag(version) && !isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const isEE = isRollingTag(version)
    ? isRollingTagEnterprise(version)
    : isEnterpriseVersion(version);

  const repo = isEE ? "metabase/metabase-enterprise" : "metabase/metabase";
  return `${repo}:${version}`;
};
