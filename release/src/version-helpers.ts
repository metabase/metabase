import { compare as compareVersions, coerce } from "semver";

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

export const isLatestVersion = (thisVersion: string, allVersions: string[]) => {
  if (isRCVersion(thisVersion)) {
    return false;
  }

  const normalizedVersions = allVersions
    .filter(isValidVersionString)
    .filter(version => !isRCVersion(version))
    .map((version) => String(coerce(version.replace(/(v1|v0)\./, ''))))
    .sort(compareVersions);

  if (!normalizedVersions.length) {
    return true;
  }

  const lastVersion = normalizedVersions[normalizedVersions.length - 1];

  return compareVersions(String(coerce(thisVersion.replace(/(v1|v0)\./, ''))), lastVersion) > -1;
};

export const getNextVersions = (versionString: string): string[] => {
  if (!isValidVersionString(versionString)) {
    throw new Error(`Invalid version string: ${versionString}`);
  }

  const versionType = getVersionType(versionString);

  if (versionType === 'rc' || versionType === 'patch') {
    return [];
  }

  const editionString = isEnterpriseVersion(versionString)
    ? 'v1.'
    : 'v0.';

  // minor releases -> next minor release
  const [major, minor] = versionString
    .replace(/(v1|v0)\./, '')
    .replace(/.0$/, "")
    .split('.')
    .map(Number);

  if (versionType === 'minor') {
    return [editionString + [major, minor + 1].join('.')];
  }


  // major releases -> x.1 minor release AND next .0 major release
  if (versionType === 'major') {
    return [
      editionString + [major, 1].join('.'),
      editionString + [major + 1, 0].join('.'),
    ];
  }

  return [];
};
