import { compare as compareVersions, coerce } from "semver";

import type { GithubProps, Tag } from "./types";

// https://regexr.com/7l1ip
export const isValidVersionString = (versionString: string) => {
  return /^(v0|v1)\.(\d|\.){3,}(\-rc\d+|\-RC\d+)*$/.test(versionString);
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

  const versionParts = versionString.replace(/.0$/, "").split(".").length;

  if (isRCVersion(versionString)) {
    return "rc"; // x.88-RC2
  }

  switch (versionParts) {
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

export const isRCVersion = (version: string) =>
  isValidVersionString(version) && /rc/i.test(version);

export const getMajorVersion = (versionString: string) =>
  versionString
    .replace(/^[^\.]+\./, "")
    .replace(/-rc\d+/i, "")
    .split(".")[0];

export const getReleaseBranch = (versionString: string) => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }
  const majorVersion = getMajorVersion(versionString);
  return `release-x.${majorVersion}.x`;
};

export const getVersionFromReleaseBranch = (branch: string) => {
  const match = /release-x\.(\d+)\.x$/.exec(branch);

  if (!match) {
    throw new Error(`Invalid release branch: ${branch}`);
  }
  const majorVersion = match[1];
  return `v0.${majorVersion}.0`;
}

export const isLatestVersion = (thisVersion: string, allVersions: string[]) => {
  if (isRCVersion(thisVersion)) {
    return false;
  }

  const normalizedVersions = allVersions
    .filter(isValidVersionString)
    .filter(version => !isRCVersion(version))
    .map(version => String(coerce(version.replace(/(v1|v0)\./, ""))))
    .sort(compareVersions);

  if (!normalizedVersions.length) {
    return true;
  }

  const lastVersion = normalizedVersions[normalizedVersions.length - 1];

  return (
    compareVersions(
      String(coerce(thisVersion.replace(/(v1|v0)\./, ""))),
      lastVersion,
    ) > -1
  );
};

export const versionRequirements: Record<
  number,
  { java: number; node: number }
> = {
  43: { java: 8, node: 14 },
  44: { java: 11, node: 14 },
  45: { java: 11, node: 14 },
  46: { java: 11, node: 16 },
  47: { java: 11, node: 18 },
  48: { java: 11, node: 18 },
  49: { java: 11, node: 18 },
  50: { java: 11, node: 18 },
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

  const versionType = getVersionType(versionString);

  if (versionType === "rc" || versionType === "patch") {
    return [];
  }

  const editionString = isEnterpriseVersion(versionString) ? "v1." : "v0.";

  // minor releases -> next minor release
  const [major, minor] = versionString
    .replace(/(v1|v0)\./, "")
    .split(".")
    .map(Number);

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
  return getOSSVersion(version)
    .replace(/^v/, "")
    .replace(/-rc\d+$/i, "") // RC versions use the major version milestone
    .replace(/\.0$/, "");
};

// for auto-setting milestones, we don't ever want to auto-set a patch milestone
// which we release VERY rarely
export function ignorePatches(version: string) {
  return version.split('.').length < 4;
}

const normalizeVersionForSorting = (version: string) =>
  version.replace(/^(v?)(0|1)\./, '');

export function versionSort(a: string, b: string) {
  const [aMajor, aMinor, aPatch] = normalizeVersionForSorting(a).split('.').map(Number);
  const [bMajor, bMinor, bPatch] = normalizeVersionForSorting(b).split('.').map(Number);


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

export function getLastReleaseFromTags(tags: Tag[]) {
  return tags
    .map(tag => tag.ref.replace('refs/tags/', ''))
    .filter(tag => !isRCVersion(tag)) // we want to ignore RC tags because release notes should be cumulative
    .sort(versionSort)
    .reverse()[0];
}

/**
 * queries the github api to get all release version tags,
 * optionally filtered by a major version
 */
export async function getLastReleaseTag({
  github,
  owner,
  repo,
  version = '',
}: GithubProps & { version?: string }) {
  const tags =  await github.paginate(github.rest.git.listMatchingRefs, {
    owner,
    repo,
    ref: `tags/v0.${version ? getMajorVersion(version) : ''}`,
  });

  const lastRelease = getLastReleaseFromTags(tags);

  return lastRelease;
}

export const findNextPatchVersion = (version: string) => {
  if (!isValidVersionString(version) || isRCVersion(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }

  const [major, minor, patch] = version
    .replace(/(v1|v0)\./, "")
    .split(".")
    .map(Number);

  return `v0.${major}.${minor ?? 0}.${(patch ?? 0) + 1}`;
}

export const getNextPatchVersion = async ({
  github,
  owner,
  repo,
  majorVersion,
}: GithubProps & { majorVersion: number }) => {
  const lastRelease = await getLastReleaseTag({
    github, owner, repo,
    version: `v0.${majorVersion.toString()}.0`
  });

  const nextPatch = findNextPatchVersion(lastRelease);

  return nextPatch;
}
