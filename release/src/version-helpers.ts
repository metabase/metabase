import type { GithubProps, Tag } from "./types";

// https://regexr.com/7l1ip
export const isValidVersionString = (versionString: string) => {
  return /^(v0|v1)\.(\d|\.){3,}(\-(RC|rc|alpha|beta))*\d*$/.test(versionString);
};

export const isValidCommitHash = (commitHash: string) => {
  return /^[0-9a-f]{40}$/i.test(commitHash);
};

export const getOSSVersion = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }
  return versionString.replace(/^(v0|v1)\./, "v0.");
};

export const getEnterpriseVersion = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }
  return versionString.replace(/^(v0|v1)\./, "v1.");
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
  // turn v0.88.0 into 88.0
  return getOSSVersion(versionString).replace(/v0\./, "");
};

export const getVersionType = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }

  const versionPartsCount = versionString
    .replace(/\-\w.+/gi, "") // pre-release suffix
    .replace(/\.0$/, "") // majors have a trailing .0
    .split(".").length;

  switch (versionPartsCount) {
    case 2: // x.88
      return "major";
    case 3: // x.88.2
      return "minor";
    case 4: // x.88.2.3
      return "patch";
    default:
      return "invalid";
  }
};

export const isEnterpriseVersion = (versionString: string): boolean => {
  return /^v1./i.test(versionString);
};

export const isPreReleaseVersion = (version: string) =>
  isValidVersionString(version) && /rc|alpha|beta/i.test(version);

const getVersionParts = (versionString: string) => {
  const parts = versionString
    .replace(/^[^\.]+\./, "")
    .replace(/-rc\d+/i, "")
    .split(".");
  return {
    major: parts[0],
    minor: parts[1] || "0",
    patch: parts[2],
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

  return `v0.${majorVersion}.0`;
};

export const getMajorVersionFromRef = (ref: string) => {
  if (ref.startsWith("refs/tags/")) {
    const tagName = ref.replace("refs/tags/", "");
    const versionParts = getVersionParts(tagName);
    return versionParts.major;
  }

  return getMajorVersionNumberFromReleaseBranch(ref.replace("refs/heads/", ""));
};

const SDK_TAG_REGEXP = /embedding-sdk-(0\.\d+\.\d+(-\w+)?)$/;

export const getSdkVersionFromReleaseTagName = (tagName: string) => {
  const match = SDK_TAG_REGEXP.exec(tagName);

  if (!match) {
    throw new Error(`Invalid sdk release tag: ${tagName}`);
  }

  return match[1];
};

export const getDotXs = (version: string, number: number) => {
  const pieces = version.replace(/-.+/, "").split("."); // ignore any -suffixes
  return pieces.slice(0, number + 1).join(".") + ".x";
};

export const getDotXVersion = (version: string) => {
  const versionType = getVersionType(version);

  if (versionType === "major") {
    return getDotXs(version, 1);
  }

  return getDotXs(version, 2);
};

const shouldAddLatestTag = ({
  version,
  latestMajorVersion,
}: {
  version: string;
  latestMajorVersion?: string;
}) => {
  const majorVersion = getMajorVersion(version);
  return majorVersion === latestMajorVersion;
};

export const getExtraTagsForVersion = ({
  version,
  latestMajorVersion,
}: {
  version: string;
  latestMajorVersion?: string;
}) => {
  const ossVersion = getOSSVersion(version);
  const eeVersion = getEnterpriseVersion(version);
  const versionType = getVersionType(version);

  // eg. v0.23.x / v1.23.x
  const baseTags = [getDotXs(ossVersion, 1), getDotXs(eeVersion, 1)];
  // eg. v0.23.4.x / v1.23.4.x
  const minorTags = versionType !== "major"
    ? [getDotXs(ossVersion, 2), getDotXs(eeVersion, 2)]
    : [];

  return [
    ...baseTags,
    ...minorTags,
    ...(shouldAddLatestTag({ version, latestMajorVersion }) ? ["latest"] : []),
  ];
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
    tags: tags.filter(filterOutNonSupportedPrereleaseIdentifier),
  });

  return lastRelease;
}

const ALLOWED_SDK_PRERELEASE_IDENTIFIERS = ["nightly"];
/**
 *
 * @param tag a GitHub tag object
 */
export function filterOutNonSupportedPrereleaseIdentifier(tag: Tag) {
  const prereleaseIdentifier = /\d+\.\d+\.\d+-(?<prerelease>\w+)$/.exec(tag.ref)
    ?.groups?.prerelease;

  return (
    !prereleaseIdentifier ||
    ALLOWED_SDK_PRERELEASE_IDENTIFIERS.includes(prereleaseIdentifier)
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
  56: { java: 21, node: 22, platforms: "linux/amd64,linux/arm64" },
  57: { java: 21, node: 22, platforms: "linux/amd64,linux/arm64" },
  58: { java: 21, node: 22, platforms: "linux/amd64,linux/arm64" },
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

export const getNextVersions = (versionString: string): string[] => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }

  if (isPreReleaseVersion(versionString) || isPatchVersion(versionString)) {
    return [];
  }

  const editionString = isEnterpriseVersion(versionString) ? "v1." : "v0.";

  // minor releases -> next minor release
  const [major, minor] = versionString
    .replace(/(v1|v0)\./, "")
    .split(".")
    .map(Number);

  const versionType = getVersionType(versionString);

  if (versionType === "minor") {
    return [editionString + [major, minor + 1].join(".")];
  }

  // major releases -> x.1 minor release AND next .0 major release
  if (versionType === "major") {
    return [
      editionString + [major, 1].join("."),
      editionString + [major + 1, 0].join("."),
    ];
  }

  return [];
};

// our milestones don't have the v prefix or a .0 suffix
export const getMilestoneName = (version: string) => {
  const [_prefix, major, minor] = getOSSVersion(version).split(/\.|\-/g);

  return Number(minor) ? `0.${major}.${minor}` : `0.${major}`;
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

const normalizeVersionForSorting = (version: string) =>
  version.replace(/^(v?)(0|1)\./, "");

export function versionSort(a: string, b: string) {
  const [aMajor, aMinor, aPatch] = normalizeVersionForSorting(a)
    .split(".")
    .map(Number);
  const [bMajor, bMinor, bPatch] = normalizeVersionForSorting(b)
    .split(".")
    .map(Number);

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
  version = "",
  ignorePatches,
  ignorePreReleases,
}: GithubProps & {
  version?: string;
  ignorePatches?: boolean;
  ignorePreReleases?: boolean;
}) {
  const tags = await github.paginate(github.rest.git.listMatchingRefs, {
    owner,
    repo,
    ref: `tags/v0.${version ? getMajorVersion(version) : ""}`,
  });

  const lastRelease = getLastReleaseFromTags({
    tags,
    ignorePatches,
    ignorePreReleases,
  });

  return lastRelease;
}

export const findNextPatchVersion = (version: string) => {
  if (!isValidVersionString(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const [mainVersion, suffix] = version.split("-");

  const [major, minor, patch] = mainVersion
    .replace(/(v1|v0)\./, "")
    .split(".")
    .map(Number);

  const baseVersion = `v0.${major}.${minor || 0}.${(patch || 0) + 1}`;

  return suffix ? `${baseVersion}-${suffix}` : baseVersion;
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
    version: `v0.${majorVersion.toString()}.0`,
    ignorePatches: false,
    ignorePreReleases: false,
  });

  const nextPatch = findNextPatchVersion(lastRelease);

  return nextPatch;
};

type SdkVersionInfo = {
  version: string;
  preReleaseLabel: string;
  majorVersion: string;
};

type PreReleaseInfo = {
  label: string;
  version: number | null;
};

const parsePreReleaseSuffix = (suffix: string | undefined): PreReleaseInfo => {
  if (!suffix) {
    return { label: "", version: null };
  }

  const [label, versionStr] = suffix.split(".");
  const version = versionStr ? parseInt(versionStr, 10) : null;

  return { label: label ?? "", version };
};

const getNextAlphaVersion = (
  currentVersionBase: string,
  preRelease: PreReleaseInfo,
  majorVersion: string,
): SdkVersionInfo => {
  if (preRelease.label !== "alpha") {
    throw new Error(
      "Only `alpha` versions can be released from the `master` branch.",
    );
  }

  const nextPreReleaseVersion = (preRelease.version ?? -1) + 1;

  return {
    version: `${currentVersionBase}-${preRelease.label}.${nextPreReleaseVersion}`,
    preReleaseLabel: preRelease.label,
    majorVersion,
  };
};

const getNextReleaseBranchVersion = (
  versionParts: string[],
  preRelease: PreReleaseInfo,
  majorVersion: string,
): SdkVersionInfo => {
  if (preRelease.label && preRelease.label !== "beta") {
    throw new Error(
      "Only `beta` versions can be released from the `release` branch.",
    );
  }

  const updatedVersionParts = [...versionParts];
  const lastIndex = updatedVersionParts.length - 1;
  const patchVersion = updatedVersionParts[lastIndex] ?? "0";

  // Handle .x placeholder versions
  if (patchVersion === "x") {
    updatedVersionParts[lastIndex] = "0";
  } else if (!preRelease.label && preRelease.version === null) {
    // Increment patch version for stable releases
    const currentPatch = parseInt(patchVersion, 10) || 0;
    updatedVersionParts[lastIndex] = String(currentPatch + 1);
  }

  const newVersionBase = updatedVersionParts.join(".");
  const nextPreReleaseVersion = (preRelease.version ?? -1) + 1;

  const versionSuffix = preRelease.label
    ? `-${preRelease.label}.${nextPreReleaseVersion}`
    : "";

  return {
    version: `${newVersionBase}${versionSuffix}`,
    preReleaseLabel: "",
    majorVersion,
  };
};

export const getNextSdkVersion = (
  branch: string,
  currentVersion: string,
): SdkVersionInfo => {
  const [currentVersionBase, suffix] = currentVersion.split("-");
  const versionParts = currentVersionBase.split(".");
  const majorVersion = versionParts[1] ?? "";

  if (branch === "master") {
    if (!suffix) {
      throw new Error(
        `Expected pre-release suffix on master branch, got: ${currentVersion}`,
      );
    }

    const preRelease = parsePreReleaseSuffix(suffix);
    return getNextAlphaVersion(currentVersionBase, preRelease, majorVersion);
  }

  const preRelease = parsePreReleaseSuffix(suffix);
  return getNextReleaseBranchVersion(versionParts, preRelease, majorVersion);
};
