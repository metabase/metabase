import {
  getIssueWithCache,
  getMilestones,
} from "./github";
import {
  getBackportSourcePRNumber,
  getLinkedIssues,
  getPRsFromCommitMessage,
} from "./linked-issues";
import type { GithubProps, Issue, Milestone } from "./types";
import {
  getMajorVersion,
  getVersionFromReleaseBranch,
  ignorePatches,
  versionSort,
} from "./version-helpers";

function isBackport(pullRequest: Issue) {
  return (
    pullRequest.title.includes("backport") || hasLabel(pullRequest, "was-backport")
  );
}

function hasLabel(issue: Issue, labelName: string) {
  return (
    Array.isArray(issue.labels) &&
    issue.labels.some((label) => label.name === labelName)
  );
}

const isNotNull = <T>(value: T | null): value is T => value !== null;

async function getOriginalIssues({
  github,
  repo,
  owner,
  issueNumber,
}: GithubProps & { issueNumber: number }) {
  console.log('checking', issueNumber);
  const issue = await getIssueWithCache({
    github,
    owner,
    repo,
    issueNumber,
  });

  if (!issue) {
    console.log(`  Issue ${issueNumber} not found`);
    return [];
  }

  // if this isn't a pull request, we don't need to trace further
  if (!issue.pull_request) {
    console.log('  Found an issue');
    return [issue.number];
  }

  if (isBackport(issue)) {
    const sourcePRNumber = getBackportSourcePRNumber(issue.body);
    if (sourcePRNumber && sourcePRNumber !== issueNumber) {
      console.log('  found backport PR for ', sourcePRNumber);
      return getOriginalIssues({
        github,
        repo,
        owner,
        issueNumber: sourcePRNumber,
      });
    }
  }

  const linkedIssues = await getLinkedIssues(issue.body ?? '');

  if (linkedIssues) {
    console.log('  found linked issues', linkedIssues);
    return linkedIssues.map(Number);
  }

  console.log("  no linked issues found in body");
  return [issue.number];
}

async function setMilestone({ github, owner, repo, issueNumber, milestone, ignoreExistingMilestones }: GithubProps & { issueNumber: number, milestone: Milestone, ignoreExistingMilestones?: boolean }) {
  // we can use this for both issues and PRs since they're the same for many purposes in github
  const issue = await getIssueWithCache({
    github,
    owner,
    repo,
    issueNumber,
  });

  if (!issue?.milestone) {
    console.log(`Setting milestone ${milestone.title} for issue # ${issueNumber}`);
    return github.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      milestone: milestone.number,
    });
  }

  if (ignoreExistingMilestones) {
    return;
  }

  const existingMilestone = issue.milestone;

  if (existingMilestone.number === milestone.number) {
    console.log(`Issue ${issueNumber} is already tagged with this ${milestone.title} milestone`);
    return;
  }

  const existingMilestoneIsNewer = versionSort(existingMilestone.title, milestone.title) > 0;

  // if existing milestone is newer, change it
  if (existingMilestoneIsNewer) {
    console.log(`Changing milestone from ${existingMilestone.title} to ${milestone.title}`);

    await github.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      milestone: milestone.number,
    });
  }


  console.log(`${issueNumber} is already part of ${existingMilestone.title}, no updates made.`);
  return;
}

// get the next open milestone (e.g. 0.57.8) for the given major version (e.g 57)
export function getNextMilestone(
  { openMilestones, majorVersion }:
  { openMilestones: Milestone[], majorVersion: number | string }
): Milestone | undefined {
  const milestonesForThisMajorVersion = openMilestones
    .filter(milestone => milestone.title.startsWith(`0.${majorVersion}`))
    .filter(milestone => ignorePatches(milestone.title))
    .sort((a, b) => versionSort(a.title, b.title));

  const nextMilestone = milestonesForThisMajorVersion[0];

  return nextMilestone;
}

export async function setMilestoneForCommits({
  github,
  owner,
  repo,
  branchName,
  commitMessages,
  ignoreExistingMilestones,
}: GithubProps & { commitMessages: string[], branchName: string, ignoreExistingMilestones?: boolean }) {
  // figure out milestone
  const branchVersion = getVersionFromReleaseBranch(branchName);
  const majorVersion = getMajorVersion(branchVersion);
  const openMilestones = await getMilestones({ github, owner, repo, state: 'open' });
  const nextMilestone = getNextMilestone({ openMilestones, majorVersion });

  if (!nextMilestone) {
    throw new Error(`No open milestone found for major version ${majorVersion}`);
  }

  console.log('Next milestone:', nextMilestone.title);

  // figure out issue or PR
  const PRsToCheck = uniq(
    commitMessages
      .flatMap(getPRsFromCommitMessage)
      .filter(isNotNull)
  );
  if (!PRsToCheck.length) {
    // Not every commit on a release branch is a squash-merged PR (e.g. the
    // version-bump commit from cutting the branch). Nothing to backfill here.
    console.log('No PRs found in commit messages, skipping milestone backfill');
    return;
  }

  console.log(`Checking ${PRsToCheck.length} PRs for issues to tag`);

  const issuesToTag = [];

  for (const prNumber of PRsToCheck) { // for loop to avoid rate limiting
    issuesToTag.push(...(await getOriginalIssues({
      github,
      owner,
      repo,
      issueNumber: prNumber,
    })));
  }

  const uniqueIssuesToTag = uniq(issuesToTag);

  console.log(`Tagging ${uniqueIssuesToTag.length} issues with milestone ${nextMilestone.title}`)

  for (const issueNumber of uniqueIssuesToTag) { // for loop to avoid rate limiting
    await setMilestone({
      github,
      owner,
      repo,
      issueNumber,
      milestone: nextMilestone,
      ignoreExistingMilestones,
    });
  }
}

function uniq<T>(array: T[]) {
  return Array.from<T>(new Set(array));
}
