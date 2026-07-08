import type { GithubCheck, GithubProps, Issue, ReleaseProps } from "./types";
import {
  getLastReleaseTag,
  getMilestoneName,
  getNextVersions,
  getOSSVersion,
} from "./version-helpers";

type MilestoneState = "open" | "closed" | "all";

export const getMilestones = async ({
  github,
  owner,
  repo,
  state = "all",
}: GithubProps & { state?: MilestoneState }) => {
  const milestones = await github.paginate(github.rest.issues.listMilestones, {
    owner,
    repo,
    state,
  });

  return milestones;
};

export const findMilestone = async ({
  version,
  github,
  owner,
  repo,
  state,
}: ReleaseProps & { state?: MilestoneState }) => {
  const milestones = await getMilestones({ github, owner, repo, state });
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
      github.rest.issues
        .createMilestone({
          owner,
          repo,
          title: milestoneName,
        })
        .catch(console.error),
    ),
  );
};

export const getMilestoneIssues = async ({
  version,
  github,
  owner,
  repo,
  state = "closed",
  milestoneStatus,
}: ReleaseProps & {
  state?: "closed" | "open";
  milestoneStatus?: MilestoneState;
}): Promise<Issue[]> => {
  const milestone = await findMilestone({
    version,
    github,
    owner,
    repo,
    state: milestoneStatus,
  });

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

export const hasBeenReleased = async ({
  github,
  owner,
  repo,
  version,
}: ReleaseProps) => {
  // we only create a git tag for the open source version number as of Dec 2024
  const ossVersion = getOSSVersion(version);

  const previousRelease = await github.rest.git
    .getRef({
      owner,
      repo,
      ref: "tags/" + ossVersion,
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
  // we only create a git tag for the open source version number as of Dec 2024
  const ossVersion = getOSSVersion(version);

  const newRef = await github.rest.git.createRef({
    owner,
    repo,
    ref: `refs/tags/${ossVersion}`,
    sha: commitHash,
  });

  if (newRef.status !== 201) {
    throw new Error(`failed to tag release ${ossVersion}`);
  }
};

const _issueCache: Record<number, Issue> = {};

export async function getIssueWithCache({
  github,
  owner,
  repo,
  issueNumber,
}: GithubProps & { issueNumber: number }) {
  if (_issueCache[issueNumber]) {
    return _issueCache[issueNumber];
  }

  const issue = await github.rest.issues
    .get({
      owner,
      repo,
      issue_number: issueNumber,
    })
    .catch((err: Error) => {
      console.log(err);
      return null;
    });

  if (issue?.data) {
    _issueCache[issueNumber] = issue.data as Issue;
  }

  return issue?.data as Issue | null;
}

function checksPassed(checks: GithubCheck[]) {
  // we need to check total checks to make sure we didn't hit a temporary state where all checks are passing
  // because only a few checks have triggered
  const MIN_TOTAL_CHECKS = 95; // v49 has 96 checks, v50 has 99 checks

  const failedChecks = checks.filter(
    check => !["success", "skipped"].includes(check.conclusion ?? ""),
  );

  const pendingChecks = checks.filter(check => check.status === "in_progress");
  const totalChecks = checks.length;

  const sha = checks[0]?.head_sha;

  console.log({ sha, totalChecks, failedChecks, pendingChecks });

  return (
    failedChecks.length === 0 &&
    pendingChecks.length === 0 &&
    totalChecks >= MIN_TOTAL_CHECKS
  );
}

export async function getChecksForRef({
  github,
  owner,
  repo,
  ref,
}: GithubProps & { ref: string }) {
  const checks = await github.paginate(github.rest.checks.listForRef, {
    owner,
    repo,
    ref,
    per_page: 100,
  });

  return checks;
}

export async function getLatestGreenCommit({
  github,
  owner,
  repo,
  branch,
}: GithubProps & { branch: string }) {
  const MAX_COMMITS = 10;

  const compareResponse = await github.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `refs/heads/${branch}~${MAX_COMMITS}...refs/heads/${branch}`,
  });

  const commits = compareResponse.data.commits.reverse();

  for (const commit of commits) {
    const checks = await getChecksForRef({
      github,
      owner,
      repo,
      ref: commit.sha,
    });

    if (checksPassed(checks)) {
      return commit.sha;
    }
  }
  console.log("No green commit found");
  return null;
}

/**
 * True if `ref` is not strictly newer than the most recent release for this
 * major — i.e. its code is already shipped. We compare the last release tag
 * against the branch tip and check membership of `ref` in the returned commits
 * (which are exactly the commits on the branch that are NOT in the last
 * release's history). The previous SHA-equality check only caught the case
 * where `ref` was *the* last release tag's commit, and missed any older commit
 * further back in history — see DEV-2025.
 *
 * Known limitation: `compareCommitsWithBasehead` returns at most 250 commits
 * in a single page (the `commits` array is truncated even though `total_commits`
 * reflects the full count). If a release branch ever accumulates more than 250
 * commits since its last release tag, a candidate beyond the 250th would be
 * missing from `data.commits` and the gate would incorrectly say "already
 * released" → skip. Today's release cadence keeps `ahead_by` in single digits,
 * so this is theoretical, but worth knowing if cadence ever changes — the fix
 * is `github.paginate(github.rest.repos.compareCommitsWithBasehead, …)`.
 */
export async function hasCommitBeenReleased({
  github,
  owner,
  repo,
  ref,
  majorVersion,
}: GithubProps & { ref: string; majorVersion: number }) {
  const lastTag = await getLastReleaseTag({
    github,
    owner,
    repo,
    version: `v0.${majorVersion}.0`,
    ignorePatches: false,
    ignorePreReleases: false,
  });

  const tagDetail = await github.rest.git.getRef({
    owner,
    repo,
    ref: `tags/${lastTag}`,
  });

  const lastTagSha = tagDetail.data.object.sha;

  // Short-circuit when the candidate IS the last release tag's commit. The
  // compare API excludes the base from `data.commits`, so this case would
  // otherwise reach the membership check and return `true` only as a
  // side effect of "base is not in the commits list" — calling it out
  // explicitly is clearer and saves an API call.
  if (lastTagSha === ref) {
    return true;
  }

  const { data } = await github.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${lastTagSha}...refs/heads/release-x.${majorVersion}.x`,
  });

  const isAheadOfLastRelease = data.commits.some(c => c.sha === ref);

  console.log({ lastTag, lastTagSha, ref, isAheadOfLastRelease });

  return !isAheadOfLastRelease;
}

export async function getOpenBackportPrs({
  github,
  owner,
  repo,
  majorVersion,
}: GithubProps & { majorVersion: number }) {
  const backportBranch = `release-x.${majorVersion}.x`;
  // query PR's targeting backport branch
  const prs = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    base: backportBranch,
    per_page: 100,
  });

  return prs;
}

