import { get } from "underscore";

import type { GithubProps, Tag } from "./types";

// in v56 we introduced a new versioning format
const FIRST_NEW_VERSION_FORMAT = 56;

export const isValidVersionString = (versionString: string) => {
  return isOldVersionFormat(versionString) || isNewVersionFormat(versionString);
};

// v0.55.4.5 | v1.55.4.5
export const isOldVersionFormat = (versionString: string): boolean => {
  // https://regexr.com/8g1n3
  const format = /^(v0|v1)\.(\d+|\.){3,}(\-(RC|rc|alpha|beta){1})*\d*$/.exec(versionString);
  if (!format) {
    return false;
  }
  const majorVersion = Number(versionString.split(".")[1]);
  return majorVersion < FIRST_NEW_VERSION_FORMAT;
}

// v56.4.5 | v56.4.5-agpl
export const isNewVersionFormat = (versionString: string): boolean => {
  // https://regexr.com/8g1n6
  const format = /^v\d+\.(\d+|\.){1,3}(\-(beta|agpl|agpl-beta){1}){0,1}$/.test(versionString);
  if (!format) {
    return false;
  }
  const majorVersion = Number(versionString.replace('v', '').split(".")[0]);
  return majorVersion >= FIRST_NEW_VERSION_FORMAT;
};

export const isValidCommitHash = (commitHash: string) => {
  return /^[0-9a-f]{40}$/i.test(commitHash);
};

export const getOSSVersion = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }
  if (!isEnterpriseVersion(versionString)) {
    return versionString; // already in OSS format
  }

  if (isOldVersionFormat(versionString)) {
    return versionString.replace(/^(v0|v1)\./, "v0.");
  }

  const { suffix } = getVersionParts(versionString);
  return `${versionString.replaceAll(suffix, "")}-agpl${suffix}`;
};

export const getEnterpriseVersion = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }
  if (isEnterpriseVersion(versionString)) {
    return versionString; // already in Enterprise format
  }
  if (isOldVersionFormat(versionString)) {
    return versionString.replace(/^(v0|v1)\./, "v1.");
  }
  return versionString.replace(/-agpl/, "");
};

export const getCanonicalVersion = (
  versionString: string,
  edition: "oss" | "ee",
) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }

  return edition === "ee"
    ? getEnterpriseVersion(versionString)
    : getOSSVersion(versionString);
};

export const getGenericVersion = (versionString: string) => {
  // turn v0.88.0 into 88.0 or v75.2-agpl into 75.2
  return getEnterpriseVersion(versionString)
    .replaceAll(/^(v1|v)/g, "")
    .replace(/-agpl/, "")
};

export const getVersionType = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }

  const versionParts = getVersionParts(versionString);

  if (versionParts.patch != null) {
    return "patch";
  }

  if (versionParts.minor !== "0") {
    return "minor";
  }

  return "major";
};

export const isEnterpriseVersion = (versionString: string): boolean => {
  if(!isValidVersionString(versionString)){
    return false;
  }

  if (isOldVersionFormat(versionString)) {
    return /^v1./i.test(versionString);
  }

  return !/-agpl/i.test(versionString);
};

export const isPreReleaseVersion = (version: string) =>
  isValidVersionString(version) && /rc|alpha|beta/i.test(version);

export const getVersionParts = (versionString: string) => {
  const prefix = isOldVersionFormat(versionString)
    ? (isEnterpriseVersion(versionString) ? "v1." : "v0.")
    : "v";

  const suffix = /(-[-\w\d]+)$/.exec(versionString)?.[0] || "";

  const parts = versionString
    .replace(isOldVersionFormat(versionString) ? /^[^\.]+\./ : /^v/, "")
    .replace(/-[-\w\d]+/i, "")
    .split(".");

  return {
    major: parts[0],
    minor: parts[1] || "0",
    patch: parts[2],
    prefix, // includes the . if applicable
    suffix, // includes the - if applicable
  };
};

export const getMajorVersion = (versionString: string) =>
  getVersionParts(versionString).major;

export const getMinorVersion = (versionString: string) =>
  getVersionParts(versionString).minor;

export const isReleaseBranch = (branchName: string) => {
  return branchName.startsWith("release-x.");
};

export const getReleaseBranch = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }
  const majorVersion = getMajorVersion(versionString);
  return `release-x.${majorVersion}.x`;
};

export const getVersionFromReleaseBranch = (branch: string) => {
  const majorVersion = getMajorVersionNumberFromReleaseBranch(branch);

  return Number(majorVersion) >= FIRST_NEW_VERSION_FORMAT
   ? `v${majorVersion}.0`
   : `v0.${majorVersion}.0`;
};

const SDK_TAG_REGEXP = /embedding-sdk-(0\.\d+\.\d+(-\w+)?)$/;

export const getSdkVersionFromReleaseTagName = (tagName: string) => {
  const match = SDK_TAG_REGEXP.exec(tagName);

  if (!match) {
    throw new Error(`Invalid sdk release tag: ${tagName}`);
  }

  return match[1];
};

export const getSdkVersionFromReleaseBranchName = async ({
  github,
  owner,
  repo,
  branchName,
}: GithubProps & { branchName: string }) => {
  const majorVersion = getMajorVersionNumberFromReleaseBranch(branchName);

  let sdkVersion: string;

  console.log(
    `Resolved latest major release version - ${Number(majorVersion)}`,
  );

  console.log(
    `Looking for git tag - "embedding-sdk-0.${Number(majorVersion)}.*"`,
  );

  const latestSdkTagForMajorRelease = await getLastEmbeddingSdkReleaseTag({
    github,
    owner,
    repo,
    majorVersion,
  });

  console.log(
    `Resolved SDK latest release tag for v${majorVersion} - ${latestSdkTagForMajorRelease}`,
  );

  if (latestSdkTagForMajorRelease) {
    sdkVersion = getSdkVersionFromReleaseTagName(latestSdkTagForMajorRelease);

    console.log(
      `Resolved SDK latest release version for v${majorVersion} - ${sdkVersion}`,
    );

    return sdkVersion;
  }

  const latestSdkTag = await getLastEmbeddingSdkReleaseTag({
    github,
    owner,
    repo,
  });

  sdkVersion = getSdkVersionFromReleaseTagName(latestSdkTag);

  console.warn(
    `Failed to resolve latest SDK package version! Using latest SDK version available - ${sdkVersion}`,
  );

  return sdkVersion;
};

const removePreReleaseIdentifier = (version: string) => {
  return version.replace(/-(alpha|beta|nightly)$/, "");
};

// get all relevant .x tags for a version
export const getDotXs = (version: string): string[] => {
  const { prefix, major, minor, suffix } = getVersionParts(removePreReleaseIdentifier(version));
  const versionType = getVersionType(version);

  if (versionType === 'major') {
    return [`${prefix}${major}.x${suffix}`];
  }
  return [`${prefix}${major}.x${suffix}`, `${prefix}${major}.${minor}.x${suffix}`];
};

// get the most specific .x tag
export const getDotXVersion = (version: string) => {
  const tags = getDotXs(version);
  return tags[tags.length - 1];
};

export const getExtraTagsForVersion = ({ version }: { version: string }): string[] => {
  const ossVersion = getOSSVersion(version);
  const eeVersion = getEnterpriseVersion(version);

  console.log({ ossVersion, eeVersion })

  return [...getDotXs(ossVersion), ...getDotXs(eeVersion)]
};

/**
 * queries the github api to get all embedding sdk version tags
 */
export async function getLastEmbeddingSdkReleaseTag({
  github,
  owner,
  repo,
  majorVersion = "",
}: GithubProps & {
  majorVersion?: string;
}) {
  const tags = await github.paginate(github.rest.git.listMatchingRefs, {
    owner,
    repo,
    ref: `tags/embedding-sdk-0.${majorVersion}`,
  });

  const lastRelease = getLastReleaseFromTags({
    tags: tags.filter(isSupportedPrereleaseIdentifier),
  });

  return lastRelease;
}

const ALLOWED_SDK_PRERELEASE_IDENTIFIERS = ["nightly"];
/**
 *
 * @param tag a GitHub tag object
 */
export function isSupportedPrereleaseIdentifier(tag: Tag): boolean {
  const tagPrefix = "refs/tags/embedding-sdk-";
  const version = tag.ref.replace(tagPrefix, "");
  const { suffix } = getVersionParts(version);

  if (!suffix) {
    return true;
  }

  return ALLOWED_SDK_PRERELEASE_IDENTIFIERS.some(
    (identifier) => suffix.includes(identifier),
  );
}

export const getMajorVersionNumberFromReleaseBranch = (branch: string) => {
  const match = /release-x\.(\d+)\.x$/.exec(branch);

  if (!match) {
    throw new Error(`Invalid release branch: ${branch}`);
  }

  return match[1];
};

export const versionRequirements: Record<
  number,
  { java: number; node: number; platforms: string }
> = {
  43: { java: 8, node: 14, platforms: "linux/amd64" },
  44: { java: 11, node: 14, platforms: "linux/amd64" },
  45: { java: 11, node: 14, platforms: "linux/amd64" },
  46: { java: 11, node: 16, platforms: "linux/amd64" },
  47: { java: 11, node: 18, platforms: "linux/amd64" },
  48: { java: 11, node: 18, platforms: "linux/amd64" },
  49: { java: 11, node: 18, platforms: "linux/amd64" },
  50: { java: 11, node: 18, platforms: "linux/amd64" },
  51: { java: 11, node: 18, platforms: "linux/amd64" },
  52: { java: 11, node: 18, platforms: "linux/amd64" },
  53: { java: 21, node: 22, platforms: "linux/amd64,linux/arm64" },
  54: { java: 21, node: 22, platforms: "linux/amd64,linux/arm64" },
  55: { java: 21, node: 22, platforms: "linux/amd64,linux/arm64" },
};

export const getBuildRequirements = (version: string) => {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }
  const majorVersion = Number(getMajorVersion(version));

  if (majorVersion in versionRequirements) {
    return versionRequirements[majorVersion];
  }

  const lastKey =
    Object.keys(versionRequirements)[
      Object.keys(versionRequirements).length - 1
    ];
  console.warn(
    `No build requirements found for version ${version}, using latest: v${lastKey}`,
  );
  return versionRequirements[Number(lastKey)];
};

export const getNextMilestones = (versionString: string): string[] => {
  const versionType = getVersionType(versionString);

  if (isPreReleaseVersion(versionString) || versionType === "patch") {
    return [];
  }

  const { prefix, major, minor } = getVersionParts(versionString);

  if (versionType === "major") {
    return [
      `${prefix}${major}.${Number(minor) + 1}`, // next minor
      `${prefix}${Number(major) + 1}.0`,// next major
    ];
  }

  return [`${prefix}${major}.${Number(minor) + 1}`]; // next minor
};

// our milestones don't have the v prefix and ignore patches
export const getMilestoneName = (version: string) => {
  const { prefix, major, minor } = getVersionParts(version);
  return isOldVersionFormat(version)
    ? `0.${major}${minor === "0" ? "" : `.${minor}`}`
    : getGenericVersion(`${prefix}${major}.${minor}`);
};

// for auto-setting milestones, we don't ever want to auto-set a patch milestone
// which we release VERY rarely
export function ignorePatches(version: string) {
  return version.split(".").length < 4;
}

export function isPatchVersion(version: string) {
  // v0.50.20.1
  return getVersionType(version) === "patch";
}

const parseVersionForSorting = (version: string) => {
  const { major, minor, patch } = getVersionParts(version);
  return { major : Number(major), minor: Number(minor), patch: Number(patch) };
}

export function versionSort(a: string, b: string) {
  const { major: aMajor, minor: aMinor, patch: aPatch } = parseVersionForSorting(a);
  const { major: bMajor, minor: bMinor, patch: bPatch } = parseVersionForSorting(b);

  if (aMajor !== bMajor) {
    return aMajor - bMajor;
  }

  if (aMinor !== bMinor) {
    return aMinor - bMinor;
  }

  if (aPatch !== bPatch) {
    return (aPatch ?? 0) - (bPatch ?? 0);
  }

  return 0;
}

export function getLastReleaseFromTags({
  tags,
  ignorePatches = false,
  ignorePreReleases = false,
}: {
  tags: Tag[];
  ignorePatches?: boolean;
  ignorePreReleases?: boolean;
}) {
  return tags
    .map((tag) => tag.ref.replace("refs/tags/", ""))
    .filter((tag) => !tag.includes(".x"))
    .filter(ignorePreReleases ? (tag) => !isPreReleaseVersion(tag) : () => true)
    .filter(ignorePatches ? (v) => !isPatchVersion(v) : () => true)
    .sort(versionSort)
    .reverse()[0];
}

/**
 * queries the github api to get all release version tags,
 * optionally filtered by a major version, and can optionally exclude patch versions
 */
export async function getLastReleaseTag({
  github,
  owner,
  repo,
  majorVersion,
  ignorePatches,
  ignorePreReleases,
}: GithubProps & {
  majorVersion: number;
  ignorePatches?: boolean;
  ignorePreReleases?: boolean;
}) {
  const refFilter = majorVersion < FIRST_NEW_VERSION_FORMAT
    ? `tags/v0.${majorVersion}`
    : `tags/v${majorVersion}`;

  const tags = await github.paginate(github.rest.git.listMatchingRefs, {
    owner,
    repo,
    ref: refFilter,
  });

  const lastRelease = getLastReleaseFromTags({
    tags,
    ignorePatches,
    ignorePreReleases,
  });

  return lastRelease;
}

// used for auto-releasing
export const findNextPatchVersion = (version: string) => {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const { major, minor, patch, prefix, suffix } = getVersionParts(version);
  const baseVersion = `${prefix}${major}.${minor || 0}.${(Number(patch || 0)) + 1}`;
  return `${baseVersion}${suffix}`;
};

export const getNextPatchVersion = async ({
  github,
  owner,
  repo,
  majorVersion,
}: GithubProps & { majorVersion: number }) => {
  const lastRelease = await getLastReleaseTag({
    github,
    owner,
    repo,
    majorVersion,
    ignorePatches: false,
    ignorePreReleases: false,
  });

  const nextPatch = findNextPatchVersion(lastRelease);

  return nextPatch;
};
