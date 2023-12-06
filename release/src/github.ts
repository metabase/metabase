/* eslint-disable no-console */
import {
  isEnterpriseVersion,
  getOSSVersion,
  isLatestVersion,
  getNextVersions,
} from "./version-helpers";

import type { ReleaseProps, Issue } from "./types";

const findMilestone = async ({
  version,
  github,
  owner,
  repo,
}: ReleaseProps) => {
  const milestones = await github.rest.issues.listMilestones({
    owner,
    repo,
    state: "open",
  });

  // our milestones don't have the v prefix or a .0 suffix
  const expectedMilestoneName = getOSSVersion(version)
    .replace(/^v/, "")
    .replace(/-rc\d+$/i, "") // RC versions use the major version milestone
    .replace(/\.0$/, '');

  return milestones.data.find(
    (milestone: { title: string; number: number }) =>
      milestone.title === expectedMilestoneName,
  )?.number;
};

export const closeMilestone = async ({
  github,
  owner,
  repo,
  version,
}: ReleaseProps) => {
  const milestoneId = await findMilestone({ version, github, owner, repo });

  if (!milestoneId) {
    console.log(`No milestone found for ${version}`);
    return;
  }

  await github.rest.issues.updateMilestone({
    owner,
    repo,
    milestone_number: milestoneId,
    state: "closed",
  });
};

export const openNextMilestones = async ({
  github,
  owner,
  repo,
  version,
}: ReleaseProps) => {
  const nextMilestones = getNextVersions(version).map(version =>
    getOSSVersion(version).replace(/^v/, ""),
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
}: ReleaseProps): Promise<Issue[]> => {
  const milestoneId = await findMilestone({ version, github, owner, repo });

  if (!milestoneId) {
    return [];
  }

  // we have to use paginate function or the issues will be truncated to 100
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    milestone: milestoneId.toString(),
    state: "closed",
  });

  return (issues ?? []) as Issue[];
};

// latest for the purposes of github release notes
export const isLatestRelease = async ({
  version,
  github,
  owner,
  repo,
}: ReleaseProps): Promise<"true" | "false"> => {
  // for the purposes of github releases enterprise versions are never latest
  if (isEnterpriseVersion(version)) {
    return "false";
  }

  const releases = await github.rest.repos.listReleases({
    owner,
    repo,
  });

  const releaseNames = releases.data.map(
    (r: { tag_name: string }) => r.tag_name,
  );

  // github needs this to be a string
  return isLatestVersion(version, releaseNames) ? "true" : "false";
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
