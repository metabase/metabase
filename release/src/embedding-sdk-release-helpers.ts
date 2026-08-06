import { readFileSync, writeFileSync } from "fs";

import semver from "semver";

import {
  getMajorVersionNumberFromReleaseBranch,
  isReleaseBranch,
} from "./version-helpers";

// Compute what the Embedding SDK release publishes for a given branch, current
// version, and release type: the next version, its npm dist-tag, and whether it
// takes the `latest` tag.

export type SdkReleaseType = "alpha" | "beta" | "preminor" | "patch" | "custom";

// alpha and beta are reserved for the master and release-branch flows.
const RESERVED_PRERELEASE_IDS = ["alpha", "beta"];

// SDK major is the second segment (0.63.0 -> 63), not semver's major (always 0).
export function getSdkMajorVersion(version: string): string {
  return version.split(".")[1];
}

// The prerelease id on a version (0.62.5-data-apps.0 -> data-apps), or "".
function getPrereleaseId(version: string): string {
  const match = /^[0-9.]*-(?<prereleaseId>[a-z][a-z0-9-]*)(?:\.[0-9]*)?$/.exec(
    version,
  );
  return match?.groups?.prereleaseId ?? "";
}

const PRERELEASE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

// Input-only checks; the version-dependent custom checks live in
// computeNextSdkVersion.
export function validateBranchReleaseType({
  branch,
  releaseType,
  prereleaseId,
}: {
  branch: string;
  releaseType: SdkReleaseType;
  prereleaseId: string;
}): void {
  if (releaseType !== "custom" && prereleaseId) {
    throw new Error(
      `prerelease_id is only used with release_type=custom (got release_type=${releaseType}). Either pick release_type=custom, or clear prerelease_id.`,
    );
  }

  if (
    branch === "master" &&
    releaseType !== "alpha" &&
    releaseType !== "preminor"
  ) {
    throw new Error(
      `Only 'alpha' or 'preminor' releases can be bumped from the 'master' branch (got release_type=${releaseType}).`,
    );
  }

  if (
    isReleaseBranch(branch) &&
    releaseType !== "beta" &&
    releaseType !== "patch"
  ) {
    throw new Error(
      `Only 'beta' or 'patch' releases can be bumped from a release branch (got release_type=${releaseType}, branch=${branch}).`,
    );
  }

  if (
    branch !== "master" &&
    !isReleaseBranch(branch) &&
    releaseType !== "custom"
  ) {
    throw new Error(
      `'${branch}' is not master or a release branch - only release_type=custom is allowed here (got release_type=${releaseType}).`,
    );
  }

  if (
    releaseType === "custom" &&
    RESERVED_PRERELEASE_IDS.includes(prereleaseId)
  ) {
    throw new Error(
      `prerelease_id '${prereleaseId}' is reserved for master/release-branch releases. Pick a distinct one-off id (e.g. data-apps, esbuild).`,
    );
  }

  if (
    releaseType === "custom" &&
    prereleaseId &&
    !PRERELEASE_ID_PATTERN.test(prereleaseId)
  ) {
    throw new Error(
      `prerelease_id '${prereleaseId}' must be lowercase, start with a letter, and contain only letters, digits and hyphens (e.g. data-apps).`,
    );
  }
}

function increment({
  version,
  release,
  prereleaseId,
}: {
  version: string;
  release: semver.ReleaseType;
  prereleaseId: string;
}): string {
  // Empty prerelease id -> 2-arg call, so semver reuses any existing one.
  const next = prereleaseId
    ? semver.inc(version, release, prereleaseId)
    : semver.inc(version, release);
  if (!next) {
    throw new Error(
      `semver could not compute a ${release} bump from '${version}'.`,
    );
  }
  return next;
}

// Assumes the inputs already passed validateBranchReleaseType.
export function computeNextSdkVersion({
  currentVersion,
  releaseType,
  prereleaseId,
}: {
  currentVersion: string;
  releaseType: SdkReleaseType;
  prereleaseId: string;
}): string {
  switch (releaseType) {
    case "alpha":
      return increment({
        version: currentVersion,
        release: "prerelease",
        prereleaseId: "alpha",
      });
    case "beta":
      return increment({
        version: currentVersion,
        release: "prerelease",
        prereleaseId: "beta",
      });
    case "preminor":
      // next major's alpha (0.63.0-alpha.5 -> 0.64.0-alpha.0); plain alpha only
      // bumps the counter, never the minor.
      return increment({
        version: currentVersion,
        release: "preminor",
        prereleaseId: "alpha",
      });
    case "patch":
      return increment({
        version: currentVersion,
        release: "patch",
        prereleaseId: "",
      });
    case "custom": {
      // A one-off branch inherits alpha (from master) or beta (from a release
      // branch); neither is a one-off id, so it's still on its first cut.
      const currentPrereleaseId = getPrereleaseId(currentVersion);
      const existingPrereleaseId = RESERVED_PRERELEASE_IDS.includes(
        currentPrereleaseId,
      )
        ? ""
        : currentPrereleaseId;

      // prerelease_id is set iff this is the first cut.
      if (existingPrereleaseId && prereleaseId) {
        throw new Error(
          `This branch already uses the prerelease id '${existingPrereleaseId}' - leave prerelease_id empty to bump it. To change the id, reset the version in package.template.json by hand.`,
        );
      }
      if (!existingPrereleaseId && !prereleaseId) {
        throw new Error(
          "prerelease_id is required when cutting a new one-off branch - it becomes the prerelease id in the version (0.62.5-<id>.0) and the npm dist-tag (<major>-<id>).",
        );
      }

      // First cut: use the given prerelease id. Later (prerelease id ""): semver
      // reuses the prerelease id in the version.
      return increment({
        version: currentVersion,
        release: "prerelease",
        prereleaseId,
      });
    }
    default:
      throw new Error(`Unsupported release_type: ${releaseType}`);
  }
}

export function computeSdkDistTag({
  newVersion,
  releaseType,
}: {
  newVersion: string;
  releaseType: SdkReleaseType;
}): string {
  const major = getSdkMajorVersion(newVersion);
  switch (releaseType) {
    case "alpha":
    case "preminor":
      return "alpha";
    case "beta":
      return `${major}-beta`;
    case "patch":
      return `${major}-stable`;
    case "custom": {
      // id read back from the computed version (0.62.5-data-apps.0 -> 62-data-apps).
      const prereleaseId = getPrereleaseId(newVersion);
      if (!prereleaseId) {
        throw new Error(
          `Could not read a prerelease id back from '${newVersion}'.`,
        );
      }
      return `${major}-${prereleaseId}`;
    }
    default:
      throw new Error(`Unsupported release_type: ${releaseType}`);
  }
}

// `latest` only when patching the release branch whose major is the current gold.
export function shouldSdkTagAsLatest({
  releaseType,
  branch,
  latestMajorVersion,
}: {
  releaseType: SdkReleaseType;
  branch: string;
  latestMajorVersion: string;
}): boolean {
  return (
    releaseType === "patch" &&
    isReleaseBranch(branch) &&
    getMajorVersionNumberFromReleaseBranch(branch) === latestMajorVersion
  );
}

type SdkVersionBumpResult = {
  previousVersion: string;
  newVersion: string;
  majorVersion: string;
  distTag: string;
  tagAsLatest: boolean;
};

// Entry point for the SDK Version Bump PR workflow: read the current version,
// compute the bump, write it back, and return the values as step outputs.
export function applySdkVersionBump({
  packageTemplatePath,
  branch,
  releaseType,
  prereleaseId = "",
  latestMajorVersion,
}: {
  packageTemplatePath: string;
  branch: string;
  releaseType: SdkReleaseType;
  prereleaseId?: string;
  latestMajorVersion: string;
}): SdkVersionBumpResult {
  const packageTemplate = JSON.parse(readFileSync(packageTemplatePath, "utf8"));
  const previousVersion: string = packageTemplate.version;

  validateBranchReleaseType({ branch, releaseType, prereleaseId });
  const newVersion = computeNextSdkVersion({
    currentVersion: previousVersion,
    releaseType,
    prereleaseId,
  });
  const majorVersion = getSdkMajorVersion(newVersion);
  const distTag = computeSdkDistTag({ newVersion, releaseType });
  const tagAsLatest = shouldSdkTagAsLatest({
    releaseType,
    branch,
    latestMajorVersion,
  });

  // Mutate only .version and .sdkRelease, preserving the rest of the file.
  packageTemplate.version = newVersion;
  packageTemplate.sdkRelease = { distTag, tagAsLatest };
  writeFileSync(
    packageTemplatePath,
    JSON.stringify(packageTemplate, null, 2) + "\n",
  );

  return { previousVersion, newVersion, majorVersion, distTag, tagAsLatest };
}

type SdkReleaseMetadata = {
  version: string;
  majorVersion: string;
  distTag: string;
  tagAsLatest: boolean;
};

// Read the version + committed sdkRelease metadata (written by the bump PR) that
// the release workflow publishes. Throws if the sdkRelease block is missing.
export function readSdkReleaseMetadata({
  packageTemplatePath,
}: {
  packageTemplatePath: string;
}): SdkReleaseMetadata {
  const packageTemplate = JSON.parse(readFileSync(packageTemplatePath, "utf8"));
  const version: string = packageTemplate.version;
  const distTag: string = packageTemplate.sdkRelease?.distTag ?? "";
  if (!distTag) {
    throw new Error(
      `${packageTemplatePath} is missing sdkRelease.distTag - add it (via sdk-version-bump-pr.yml or by hand) before releasing.`,
    );
  }
  return {
    version,
    majorVersion: getSdkMajorVersion(version),
    distTag,
    tagAsLatest: packageTemplate.sdkRelease?.tagAsLatest ?? false,
  };
}
