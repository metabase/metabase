import fs from 'fs';

import { Octokit } from '@octokit/rest';
import { $ } from 'zx';

import { getOpenBackportPrs } from './github';
import { issueNumberRegex } from './linked-issues';

type CommitInfo = {
  versions: string[],
  message: string,
  hash: string,
  date: string,
}

const tablePageTemplate = fs.readFileSync('./src/tablePageTemplate.html', 'utf8');

export async function gitLog(majorVersion: number) {
  const previousMajorVersion = majorVersion - 1; // we want to parse back to the prior major version to get everything in the .0 release.
  const { stdout: baseCommit } = await $`git merge-base origin/release-x.${previousMajorVersion}.x origin/master`;
  const { stdout } = await $`git log ${baseCommit.trim()}..origin/release-x.${majorVersion}.x --pretty='format:%(decorate:prefix=,suffix=)||%s||%H||%ah'`;
  const processedCommits = stdout.split('\n').map(processCommit);
  return buildTable(processedCommits);
}

export function processCommit(commitLine: string): CommitInfo {
  const [refs, message, hash, date] = commitLine.split('||');
  const tags = refs?.match(/tag: ([\w\d-_x\.]+)/g) ?? '';

  const versions = tags
    ? tags.map((v) => v.replace('tag: ', ''))
    : [''];

  return { versions, message, hash, date};
}

const issueLink = (issueNumber: string) => `https://github.com/metabase/metabase/issues/${issueNumber}`;

function escapeHtml(unsafe: string = '') {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function linkifyIssueNumbers(message: string) {
  return escapeHtml(message)?.replace(issueNumberRegex, (_, issueNumber) => {
    return `<a href="${issueLink(issueNumber)}" target="_blank">(#${issueNumber})</a>`;
  }) ?? message ?? '';
}

function tableRow(commit: CommitInfo) {
  return `<tr>
    <td><strong>${commit.versions.join('<br>')}</strong></td>
    <td>${linkifyIssueNumbers(commit.message)}</td>
    <td>${commit.date}</td>
  </tr>`;
}

function buildTable(commits: CommitInfo[]) {
  const rows = commits.map(tableRow).join('\n');
  const tableHtml = `
    <table>
      <thead>
        <tr>
          <th>Version</th>
          <th>Commit Message</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;

  return tableHtml;
}

type PullRequest = {
  html_url: string,
  number: number,
  title: string,
  assignee: { login: string },
  created_at: string,
}

function createBackportTable(prs: PullRequest[]) {
  const rows = prs.map(pr => {
    const assignee = pr.assignee ? pr.assignee.login : '?';
    return `<tr>
      <td><a href="${pr.html_url}" target="_blank">#${pr.number}</a></td>
      <td>${linkifyIssueNumbers(pr.title)}</td>
      <td>@${assignee}</td>
      <td>${new Date(pr.created_at).toLocaleString()}</td>
    </tr>`;
  }).join('\n');

  return `<table>
    <thead>
      <tr>
        <th>PR</th>
        <th>Title</th>
        <th>Assignee</th>
        <th>Created At</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}


export async function generateReleaseLog() {
  const version = Number(process.argv[2]);

  if (!version) {
    console.error('Please provide a version number (e.g. 35, 57)');
    process.exit(1);
  }

  const github = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const backportPRs = await getOpenBackportPrs({
    github,
    owner: 'metabase',
    repo: 'metabase',
    majorVersion: version,
  });

  const backportTable = createBackportTable(backportPRs as PullRequest[]);

  const commitTable = await gitLog(version);

  return tablePageTemplate
    .replace(/{{release-table}}/, commitTable)
    .replace(/{{backport-table}}/, backportTable)
    .replace(/{{major-version}}/g, version.toString())
    .replace(/{{current-time}}/, new Date().toLocaleString());
}
