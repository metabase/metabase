import semver from "semver";

// The logic that decides what the Embedding SDK release process publishes:
// given a branch, the current version, and a chosen release type, compute the
// next version, its npm dist-tag, and whether it should take the `latest` tag.
//
// This is a straight port of the bash that used to live inline in
// .github/workflows/sdk-version-bump-pr.yml, extracted here so the branchy
// version/dist-tag logic has unit tests. Kept separate from the core-app
// version helpers (version-helpers.ts) on purpose - the SDK versioning rules
// are their own thing and must not be conflated with the OSS/EE tag logic.

export type SdkReleaseType = "alpha" | "beta" | "preminor" | "patch" | "custom";

export type SdkReleaseMetadata = {
  version: string;
  major: string;
  distTag: string;
  tagAsLatest: boolean;
};

// alpha/beta are the ids the master and release-branch flows own; a one-off
// branch can't reuse them (a custom beta would land on the real <major>-beta
// dist-tag, alpha on the shared alpha line).
const RESERVED_PRERELEASE_IDS = ["alpha", "beta"];

const PRERELEASE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

// The SDK "major" is the second dot-segment (0.63.0 -> 63), matching the
// `cut -d. -f2` the workflows use - not semver's real major, which is always 0.
export function getSdkMajorVersion(version: string): string {
  return version.split(".")[1];
}

// The prerelease id already on a version, with an optional counter
// (0.62.5-data-apps.0 -> data-apps). alpha/beta are treated as "no one-off id":
// a branch cut from master sits on 0.63.0-alpha.5 and that's still a first cut.
function getExistingPrereleaseId(version: string): string {
  const match = /^[0-9.]*-([a-z][a-z0-9-]*)(\.[0-9]*)?$/.exec(version);
  const id = match?.[1] ?? "";
  return id === "alpha" || id === "beta" ? "" : id;
}

// The prerelease id read back out of a freshly bumped version, which always
// carries a counter (0.62.5-data-apps.0 -> data-apps).
function getComputedPrereleaseId(version: string): string {
  const match = /^[0-9.]*-([a-z][a-z0-9-]*)\.[0-9]*$/.exec(version);
  return match?.[1] ?? "";
}

// Input-only validation: the branch x release_type matrix, plus the prerelease_id
// rules that don't need the current version. Throws on the first violation.
// Version-dependent custom checks (first-cut vs later-bump) live in
// computeNextSdkVersion, which is where the current version is available.
export function validateBranchReleaseType(
  branch: string,
  releaseType: SdkReleaseType,
  prereleaseId: string,
): void {
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
    branch.startsWith("release-x.") &&
    releaseType !== "beta" &&
    releaseType !== "patch"
  ) {
    throw new Error(
      `Only 'beta' or 'patch' releases can be bumped from a release branch (got release_type=${releaseType}, branch=${branch}).`,
    );
  }

  if (
    branch !== "master" &&
    !branch.startsWith("release-x.") &&
    releaseType !== "custom"
  ) {
    throw new Error(
      `'${branch}' is not master or a release branch - only release_type=custom is allowed here (got release_type=${releaseType}).`,
    );
  }

  if (releaseType === "custom" && RESERVED_PRERELEASE_IDS.includes(prereleaseId)) {
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

function increment(
  version: string,
  release: semver.ReleaseType,
  identifier?: string,
): string {
  const next =
    identifier === undefined
      ? semver.inc(version, release)
      : semver.inc(version, release, identifier);
  if (!next) {
    throw new Error(
      `semver could not compute a ${release} bump from '${version}'.`,
    );
  }
  return next;
}

// Compute the next SDK version for a release type. Assumes the inputs already
// passed validateBranchReleaseType; the custom branch adds the version-dependent
// first-cut vs later-bump checks (which need the current version).
export function computeNextSdkVersion(
  currentVersion: string,
  releaseType: SdkReleaseType,
  prereleaseId: string,
): string {
  switch (releaseType) {
    case "alpha":
      return increment(currentVersion, "prerelease", "alpha");
    case "beta":
      return increment(currentVersion, "prerelease", "beta");
    case "preminor":
      // master -> next major's alpha (0.63.0-alpha.5 -> 0.64.0-alpha.0). `alpha`
      // only ever bumps the existing counter, so it can't move the minor.
      return increment(currentVersion, "preminor", "alpha");
    case "patch":
      return increment(currentVersion, "patch");
    case "custom": {
      const existingPrereleaseId = getExistingPrereleaseId(currentVersion);

      // prerelease_id is set if and only if this is the first cut.
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

      // First cut: caller supplies the id. Later bumps: no id, so semver reuses
      // the id already in the version and bumps its counter
      // (0.62.5-data-apps.0 -> 0.62.5-data-apps.1).
      return prereleaseId
        ? increment(currentVersion, "prerelease", prereleaseId)
        : increment(currentVersion, "prerelease");
    }
    default:
      throw new Error(`Unsupported release_type: ${releaseType}`);
  }
}

// The npm dist-tag for a release. Every tag here is real and in use today:
// alpha, <major>-beta, <major>-stable, and the one-off <major>-<id>
// (56-esbuild, 63-data-apps).
export function computeSdkDistTag(
  newVersion: string,
  releaseType: SdkReleaseType,
  major: string,
): string {
  switch (releaseType) {
    case "alpha":
    case "preminor":
      return "alpha";
    case "beta":
      return `${major}-beta`;
    case "patch":
      return `${major}-stable`;
    case "custom": {
      // The id comes from the version just computed, so it's identical on the
      // first cut and every later bump: 0.62.5-data-apps.0 -> 62-data-apps.
      const prereleaseId = getComputedPrereleaseId(newVersion);
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

// Take npm's `latest` tag only when patching the current gold release.
// latestMajorVersion is that major; unset means no match, not an error. The
// release-branch check is a second guard so nothing published from master or a
// one-off branch can ever take `latest`.
export function shouldSdkTagAsLatest(
  releaseType: SdkReleaseType,
  branch: string,
  major: string,
  latestMajorVersion: string | undefined,
): boolean {
  return (
    releaseType === "patch" &&
    branch.startsWith("release-x.") &&
    !!latestMajorVersion &&
    major === latestMajorVersion
  );
}

// One call for the bump workflow: validate, then compute the version, its
// dist-tag, and the tagAsLatest flag together.
export function computeSdkReleaseMetadata({
  branch,
  currentVersion,
  releaseType,
  prereleaseId = "",
  latestMajorVersion,
}: {
  branch: string;
  currentVersion: string;
  releaseType: SdkReleaseType;
  prereleaseId?: string;
  latestMajorVersion?: string;
}): SdkReleaseMetadata {
  validateBranchReleaseType(branch, releaseType, prereleaseId);
  const version = computeNextSdkVersion(currentVersion, releaseType, prereleaseId);
  const major = getSdkMajorVersion(version);
  const distTag = computeSdkDistTag(version, releaseType, major);
  const tagAsLatest = shouldSdkTagAsLatest(
    releaseType,
    branch,
    major,
    latestMajorVersion,
  );
  return { version, major, distTag, tagAsLatest };
}
