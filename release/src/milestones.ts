import fs from "fs";

import { graphql } from "@octokit/graphql";
import _ from "underscore";

import { hiddenLabels, nonUserFacingLabels } from "./constants";
import {
  findMilestone,
  getIssueWithCache,
  getMilestoneIssues,
  getMilestones,
} from "./github";
import {
  getBackportSourcePRNumber,
  getLinkedIssues,
  getPRsFromCommitMessage,
} from "./linked-issues";
import type { Commit, GithubProps, Issue, Milestone, ReleaseProps } from "./types";
import {
  getLastReleaseTag,
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

const excludedLabels = [
  ...nonUserFacingLabels,
  ...hiddenLabels,
  '.Already Fixed',
];

function getExcludedLabels(issue: Issue) {
  if (!Array.isArray(issue.labels)) {
    return [];
  }
  return issue.labels?.filter(label => label.name && excludedLabels.includes(label.name));
}

function shouldExcludeIssueFromMilestone(issue: Issue) {
  return !!getExcludedLabels(issue).length;
}

async function getIssuesWithExcludedTags({
  github,
  owner,
  repo,
  issueNumbers,
}: GithubProps & { issueNumbers: number[] }) {
  const issues = await Promise.all(
    issueNumbers.map((issueNumber) => getIssueWithCache({
      github,
      owner,
      repo,
      issueNumber,
    }))
  );

  return new Set(issues
    .filter(isNotNull)
    .filter((issue) => shouldExcludeIssueFromMilestone(issue))
    .map((issue) => issue.number));
}

async function getIssuesWithOlderMilestones({
  github,
  owner,
  repo,
  issueNumbers,
  releaseMilestone,
}: GithubProps & { issueNumbers: number[], releaseMilestone: Milestone }) {
  const issues = await Promise.all(
    issueNumbers.map((issueNumber) =>  getIssueWithCache({
      github,
      owner,
      repo,
      issueNumber,
    }))
  );

  return new Set(issues
    .filter(isNotNull)
    .filter((issue) => {
      if (issue.milestone && versionSort(issue.milestone.title, releaseMilestone.title) < 0) {
        console.log(`  Issue #${issue.number} is in an older milestone`, issue.milestone.title);
        return true;
      }

      return false;
    }).map((issue) => issue.number));
}

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

  // PRs or issues related to the SDK should not show up in core app milestones
  // We'll probably revert this when/if we land hosted bundle
  if (hasLabel(issue, "Embedding/SDK")) {
    console.log("  Skip an Embedding SDK issue or PR");
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
  ignoreExistingMilestones,
}: GithubProps & { commitMessages: string[], branchName: string, ignoreExistingMilestones?: boolean }) {
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

const issueLink = (
  { owner, repo, issueNumber }:
  { owner: string, repo: string, issueNumber: number }
) => `https://github.com/${owner}/${repo}/issues/${issueNumber}`;

export async function checkMilestoneForRelease({
  github,
  owner,
  repo,
  version,
  commitHash,
}: GithubProps & { version: string, commitHash: string }) {
  const releaseMilestone = await findMilestone({ github, owner, repo, version });

  if (!releaseMilestone) {
    throw new Error(`No open milestone found for ${version}`);
  }

  const closedMilestoneIssues = await getMilestoneIssues({
    github, owner, repo, version, state: 'closed', milestoneStatus: 'open',
  });
  const openMilestoneIssues = await getMilestoneIssues({
    github, owner, repo, version, state: 'open', milestoneStatus: 'open',
  });

  const lastTag = await getLastReleaseTag({
    github,
    owner,
    repo,
    version,
    ignorePatches: true, // ignore patch versions since we don't release notes for them
    ignorePreReleases: true, // ignore pre-releases because we want cumulative notes for them
  });

  const compareResponse = await github.rest.repos.compareCommitsWithBasehead({
    owner,
    repo,
    basehead: `${lastTag}...${commitHash}`,
  });

  const commits = compareResponse.data.commits;

  console.log(`Found ${commits.length} commits in release branch`);
  console.log(`Found ${closedMilestoneIssues.length} issues in milestone`);

  const milestoneIssueSet = new Set(closedMilestoneIssues.map(issue => issue.number));
  const commitIssueSet = new Set<number>();

  // make sure every commit in the release branch has a corresponding issue in the milestone
  const commitIssueMap: Record<string, number[]> = {};
  const issueCommitMap: Record<number, string> = {};

  for (const commit of commits) {
    const prNumbers = getPRsFromCommitMessage(commit.commit.message);
    if (!prNumbers) {
      console.log('No PRs found in commit message', commit.commit.message);
      continue;
    }

    const issueNumbers: number[] = [];

    for (const prNumber of prNumbers) {
      if (issueNumbers.includes(prNumber)) {
        continue;
      }
      issueNumbers.push(...(await getOriginalIssues({
        github,
        owner,
        repo,
        issueNumber: prNumber,
      })));
    }

    const uniqueIssues = _.uniq(issueNumbers.filter(isNotNull));
    commitIssueMap[commit.sha] = uniqueIssues;

    uniqueIssues.forEach(issueNumber => {
      commitIssueSet.add(issueNumber);
      issueCommitMap[issueNumber] = commit.sha;
    });
  }

  const allIssueNumbers = Array.from(commitIssueSet)
    .concat(Array.from(milestoneIssueSet));

  const issuesInOlderMilestones = await getIssuesWithOlderMilestones({
    github,
    owner,
    repo,
    issueNumbers: allIssueNumbers,
    releaseMilestone,
  });

  const issuesWithExcludedTags = await getIssuesWithExcludedTags({
    github,
    owner,
    repo,
    issueNumbers: allIssueNumbers,
  });

  const issuesInMilestoneNotInCommits = closedMilestoneIssues
    .filter(issue =>
      !commitIssueSet.has(issue.number) &&
      !issuesWithExcludedTags.has(issue.number) &&
      !issuesInOlderMilestones.has(issue.number)
    );

  const issuesInCommitsNotInMilestone = Array.from(commitIssueSet)
    .filter(issueNumber => (
      !milestoneIssueSet.has(issueNumber) &&
      !issuesInOlderMilestones.has(issueNumber) &&
      !issuesWithExcludedTags.has(issueNumber)
    ));

  for (const issue of issuesInMilestoneNotInCommits) {
    await addIssueToProject({
      github,
      owner,
      repo,
      issueNumber: issue.number,
      version,
      comment: 'Issue in milestone, cannot find commit',
    }).catch((e) => console.error(`error adding issue ${issue.number} to project`, e));
  }

  for (const issueNumber of issuesInCommitsNotInMilestone) {
    await addIssueToProject({
      github,
      owner,
      repo,
      issueNumber: issueNumber,
      version,
      comment: 'Issue in release branch, needs milestone',
    }).catch((e) => console.error(`error adding issue ${issueNumber} to project`, e));
  }

  for (const issue of openMilestoneIssues) {
    await addIssueToProject({
      github,
      owner,
      repo,
      issueNumber: issue.number,
      version,
      comment: 'Issue still open in milestone',
    }).catch((e) => console.error(`error adding issue ${issue.number} to project`, e));
  }

  const logText = await generateLog({
    github,
    owner,
    repo,
    version,
    commits: commits,
    lastTag,
    commitHash,
    issuesInMilestoneNotInCommits,
    issuesInCommitsNotInMilestone,
    issuesWithExcludedTags,
    issuesInOlderMilestones,
    milestoneIssueSet,
    openMilestoneIssues,
    commitIssueMap,
  });

  fs.writeFileSync(`milestone-audit-${version}.md`, logText);

  const issuesNeedingAttentionCount =
    openMilestoneIssues.length +
    issuesInMilestoneNotInCommits.length +
    issuesInCommitsNotInMilestone.length;

  return issuesNeedingAttentionCount;
}

async function generateLog({
  github,
  owner,
  repo,
  commits,
  version,
  lastTag,
  commitHash,
  issuesInMilestoneNotInCommits,
  issuesInCommitsNotInMilestone,
  issuesWithExcludedTags,
  issuesInOlderMilestones,
  milestoneIssueSet,
  openMilestoneIssues,
  commitIssueMap,
}: ReleaseProps & {
  commits: Commit[],
  lastTag: string,
  commitHash: string,
  issuesInMilestoneNotInCommits: Issue[],
  issuesInCommitsNotInMilestone: number[],
  issuesWithExcludedTags: Set<number>,
  issuesInOlderMilestones: Set<number>,
  milestoneIssueSet: Set<number>,
  openMilestoneIssues: Issue[],
  commitIssueMap: Record<string, number[]>,
}) {
  let log = `# ${version} Milestone Audit Log\n\n`;

  log += `Parsing from ${lastTag} to ${commitHash} \n`;

  log += '## Summary:\n';

  log += '\n‼️  Closed Issues in milestone but not in commits:' +
    issuesInMilestoneNotInCommits.map(
      issue => `\n   #${issue.number} (${issueLink({ owner, repo, issueNumber: issue.number })})`)
      .join('');

  log += '\n‼️  Issues in commits but not in milestone:' +
    issuesInCommitsNotInMilestone.map(
      issueNumber => `\n   #${issueNumber} (${issueLink({ owner, repo, issueNumber })})`)
      .join('');

  log += '\n‼️  Open issues in milestone:' +
    openMilestoneIssues.map(
      issue => `\n   #${issue.number} (${issueLink({ owner, repo, issueNumber: issue.number })})`)
      .join('');

  log += '\n\n## Commits in release branch\n';

  for (const hash in commitIssueMap) {
    const msg = commits.find(commit => commit.sha === hash)?.commit.message;
    log += `\n➡️  ${msg?.split('\n')[0]} [${hash.slice(0, 7)}]\n`;

    for (const issueNumber of commitIssueMap[hash]) {
      if (milestoneIssueSet.has(issueNumber)) {
        log += `   ✅ Issue #${issueNumber} is in milestone\n`;
      } else if (issuesInOlderMilestones.has(issueNumber)) {
        log += `   ✅ Issue #${issueNumber} is in an older milestone\n`;
      } else if (issuesWithExcludedTags.has(issueNumber)) {
        const issue = await getIssueWithCache({
          github,
          owner,
          repo,
          issueNumber,
        });
        const excludedTags = issue ? getExcludedLabels(issue) : [];
        log += `   ✅ Issue #${issueNumber} has excluded tags: ${excludedTags.map(l => l.name).join(',')}\n`;
      } else {
        log +=`   ❌ Issue #${issueNumber} is not in milestone, but probably should be (${issueLink({ owner, repo, issueNumber })})\n`;
      }
    }
  }

  return log;
}

const releaseIssueProject = {
  id: 'PVT_kwDOAKCINc4Ajw5A',
  commentColId: 'PVTF_lADOAKCINc4Ajw5AzgcE7NA',
  versionColId: 'PVTF_lADOAKCINc4Ajw5AzgcE7PY',
};

async function addIssueToProject({
  github,
  owner,
  repo,
  issueNumber,
  comment,
  version,
}: GithubProps & { issueNumber: number, comment: string, version: string }) {
  console.log(`Possible problem issue: #${issueNumber} - ${comment}`);

  const issue = await getIssueWithCache({
    github,
    owner,
    repo,
    issueNumber,
  });

  if (!issue) {
    console.log(`Issue ${issueNumber} not found`);
    return;
  }

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${process.env.GITHUB_TOKEN}`,
    },
  });

  const response = await graphqlWithAuth(`mutation {
    addProjectV2ItemById(input: {
      projectId: "${releaseIssueProject.id}",
      contentId: "${issue?.node_id}"
    })
    { item { id } }
  }`) as { addProjectV2ItemById: { item: { id: string } } };

  const itemId = response.addProjectV2ItemById.item.id;

  if (!itemId) {
    console.log(`Failed to add issue ${issueNumber} to project`);
    return;
  }

  await graphqlWithAuth(`
    mutation {
      setComment: updateProjectV2ItemFieldValue( input: {
        projectId: "${releaseIssueProject.id}"
        itemId: "${itemId}"
        fieldId: "${releaseIssueProject.commentColId}"
        value: { text: "${comment}" } }
      )
      { projectV2Item { id } }
      setVersion: updateProjectV2ItemFieldValue( input: {
        projectId: "${releaseIssueProject.id}"
        itemId: "${itemId}"
        fieldId: "${releaseIssueProject.versionColId}"
        value: { text: "${version}" } }
      )
      { projectV2Item { id } }
    }`);
}
