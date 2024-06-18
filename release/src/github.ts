/* eslint-disable no-console */
import type { Issue, ReleaseProps } from "./types";
import {
  getMilestoneName,
  getNextVersions,
  isLatestVersion,
  isValidVersionString,
} from "./version-helpers";

export const getMilestones = async ({
  github,
  owner,
  repo,
}: Omit<ReleaseProps, "version">) => {
  const milestones = await github.rest.issues.listMilestones({
    owner,
    repo,
    state: "open",
  });

  return milestones.data;
};

export const findMilestone = async ({
  version,
  github,
  owner,
  repo,
}: ReleaseProps) => {
  const milestones = await getMilestones({ github, owner, repo });
  const expectedMilestoneName = getMilestoneName(version);

  return milestones.find(
    (milestone: { title: string; number: number }) =>
      milestone.title === expectedMilestoneName,
  );
};

export const closeMilestone = async ({
  github,
  owner,
  repo,
  version,
}: ReleaseProps) => {
  const milestone = await findMilestone({ version, github, owner, repo });

  if (!milestone?.number) {
    console.log(`No milestone found for ${version}`);
    return;
  }

  await github.rest.issues.updateMilestone({
    owner,
    repo,
    milestone_number: milestone.number,
    state: "closed",
  });
};

export const openNextMilestones = async ({
  github,
  owner,
  repo,
  version,
}: ReleaseProps) => {
  const nextMilestones = getNextVersions(version).map(versionString =>
    getMilestoneName(versionString),
  );

  await Promise.all(
    nextMilestones.map(milestoneName =>
      github.rest.issues.createMilestone({
        owner,
        repo,
        title: milestoneName,
      }),
    ),
  );
};

export const getMilestoneIssues = async ({
  version,
  github,
  owner,
  repo,
  state = "closed",
}: ReleaseProps & { state?: "closed" | "open" }): Promise<Issue[]> => {
  const milestone = await findMilestone({ version, github, owner, repo });

  if (!milestone) {
    return [];
  }

  // we have to use paginate function or the issues will be truncated to 100
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    milestone: String(milestone.number),
    state,
  });

  return (issues ?? []) as Issue[];
};

export const isLatestRelease = async ({
  version,
  github,
  owner,
  repo,
}: ReleaseProps): Promise<boolean> => {
  if (!isValidVersionString(version)) {
    console.warn(`Invalid version string: ${version}`);
    return false;
  }
  const releases = await github.rest.repos.listReleases({
    owner,
    repo,
  });

  const releaseNames = releases.data.map(
    (r: { tag_name: string }) => r.tag_name,
  );

  return isLatestVersion(version, releaseNames);
};

export const hasBeenReleased = async ({
  github,
  owner,
  repo,
  version,
}: ReleaseProps) => {
  const previousRelease = await github.rest.git
    .getRef({
      owner,
      repo,
      ref: "tags/" + version,
    })
    .then(() => true)
    .catch(() => false);

  return previousRelease;
};

export const tagRelease = async ({
  github,
  version,
  commitHash,
  owner,
  repo,
}: ReleaseProps & { commitHash: string }) => {
  // create new ref
  const newRef = await github.rest.git.createRef({
    owner,
    repo,
    ref: `refs/tags/${version}`,
    sha: commitHash,
  });

  if (newRef.status !== 201) {
    throw new Error(`failed to tag release ${version}`);
  }
};
