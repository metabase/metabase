import _ from "underscore";
import 'zx/globals';

import {
  getMilestones,
  getIssueWithCache,
} from "./github";
import {
  getLinkedIssues,
  getPRsFromCommitMessage,
  getBackportSourcePRNumber,
} from "./linked-issues";
import type { Issue, GithubProps, Milestone } from "./types";
import {
  getMajorVersion,
  getVersionFromReleaseBranch,
  versionSort,
  ignorePatches,
} from "./version-helpers";

function isBackport(pullRequest: Issue) {
  return pullRequest.title.includes('backport') ||
    (
      Array.isArray(pullRequest.labels) &&
      pullRequest.labels.some((label) => label.name === 'was-backported')
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

async function setMilestone({ github, owner, repo, issueNumber, milestone }: GithubProps & { issueNumber: number, milestone: Milestone }) {
  // we can use this for both issues and PRs since they're the same for many purposes in github
  const issue = await getIssueWithCache({
    github,
    owner,
    repo,
    issueNumber,
  });

  if (!issue?.milestone) {
    return github.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      milestone: milestone.number,
    });
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

  const commentBody = existingMilestoneIsNewer
    ? `🚀 This should also be released by [v${existingMilestone.title}](${existingMilestone.html_url})`
    : `🚀 This should also be released by [v${milestone.title}](${milestone.html_url})`;

  console.log(`Adding comment to issue ${issueNumber} that already has milestone ${existingMilestone.title}`);

  return github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: commentBody,
  });
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
}: GithubProps & { commitMessages: string[], branchName: string}) {
  // figure out milestone
  const branchVersion = getVersionFromReleaseBranch(branchName);
  const majorVersion = getMajorVersion(branchVersion);
  const openMilestones = await getMilestones({ github, owner, repo });
  const nextMilestone = getNextMilestone({ openMilestones, majorVersion });

  if (!nextMilestone) {
    throw new Error(`No open milestone found for major version ${majorVersion}`);
  }

  console.log('Next milestone:', nextMilestone.title);

  // figure out issue or PR
  const PRsToCheck = _.uniq(
    commitMessages
      .flatMap(getPRsFromCommitMessage)
      .filter(isNotNull)
  );
  if (!PRsToCheck.length) {
    throw new Error('No PRs found in commit messages');
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

  const uniqueIssuesToTag = _.uniq(issuesToTag);

  console.log(`Tagging ${uniqueIssuesToTag.length} issues with milestone ${nextMilestone.title}`)

  for (const issueNumber of uniqueIssuesToTag) { // for loop to avoid rate limiting
    await setMilestone({ github, owner, repo, issueNumber, milestone: nextMilestone });
  }
}

