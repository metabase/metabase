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

/**
 * Get the major version number from a version string.
 * Extends the core helper to support HEAD.
 */
export const getMajorVersion = (version: string): string => {
  // HEAD is the next major version (CURRENT_VERSION + 1)
  if (version === "HEAD") {
    const currentVersion = process.env.CURRENT_VERSION;
    if (!currentVersion) {
      throw new Error("CURRENT_VERSION env var must be set when using HEAD");
    }
    return String(Number(currentVersion) + 1);
  }

  // Handle .x rolling tags (e.g., v1.59.x)
  if (version.endsWith(".x")) {
    const match = version.match(/v\d+\.(\d+)/);
    if (!match) {
      throw new Error(`Invalid rolling tag: ${version}`);
    }
    return match[1];
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
  // Handle HEAD (always considered newer than any released version)
  if (source === "HEAD" && target === "HEAD") {
    return "same";
  }
  if (source === "HEAD") {
    return "downgrade";
  }
  if (target === "HEAD") {
    return "upgrade";
  }

  // Handle .x rolling tags (e.g., v1.59.x) - compare major versions
  const sourceRolling = source.endsWith(".x");
  const targetRolling = target.endsWith(".x");
  if (sourceRolling || targetRolling) {
    const sourceMajor = parseInt(source.match(/v\d+\.(\d+)/)?.[1] || "0", 10);
    const targetMajor = parseInt(target.match(/v\d+\.(\d+)/)?.[1] || "0", 10);
    if (sourceMajor < targetMajor) {
      return "upgrade";
    }
    if (sourceMajor > targetMajor) {
      return "downgrade";
    }
    return "same";
  }

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
  // HEAD always uses enterprise image
  if (version === "HEAD") {
    return "metabase/metabase-enterprise-head:latest";
  }

  // Handle .x rolling tags (e.g., v1.59.x, v0.59.x)
  const isRollingTag = version.endsWith(".x");

  if (!isRollingTag && !isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const isEE = isRollingTag
    ? version.startsWith("v1.")
    : isEnterpriseVersion(version);
  const repo = isEE ? "metabase/metabase-enterprise" : "metabase/metabase";
  return `${repo}:${version}`;
};
