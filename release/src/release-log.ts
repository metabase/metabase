import fs from 'fs';

import { $ } from 'zx';

import { issueNumberRegex } from './linked-issues';

type CommitInfo = {
  versions: string[],
  message: string,
  hash: string,
  date: string,
}

const tablePageTemplate = fs.readFileSync('./src/tablePageTemplate.html', 'utf8');

export async function gitLog(majorVersion: number) {
  const { stdout: baseCommit } = await $`git merge-base origin/release-x.${majorVersion}.x origin/master`;
  const { stdout } = await $`git log origin/release-x.${majorVersion}.x ..${baseCommit.trim()} --pretty='format:%(decorate:prefix=,suffix=)||%s||%H||%ah'`;
  const processedCommits = stdout.split('\n').map(processCommit);
  return buildTable(processedCommits, majorVersion);
}

export function processCommit(commitLine: string): CommitInfo {
  const [refs, message, hash, date] = commitLine.split('||');
  const tags = refs?.match(/tag: ([\w\d-_\.]+)/g) ?? '';

  const versions = tags
    ? tags.map((v) => v.replace('tag: ', ''))
    : [''];

  return { versions, message, hash, date};
}

const issueLink = (issueNumber: string) => `https://github.com/metabase/metabase/issues/${issueNumber}`;

function linkifyIssueNumbers(message: string) {
  return message?.replace(issueNumberRegex, (_, issueNumber) => {
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

function buildTable(commits: CommitInfo[], majorVersion: number) {
  const rows = commits.map(tableRow).join('\n');
  const currentTime = new Date().toLocaleString();
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
  return tablePageTemplate
    .replace(/{{release-table}}/, tableHtml)
    .replace(/{{major-version}}/g, majorVersion.toString())
    .replace(/{{current-time}}/, currentTime);
}


export async function generateReleaseLog() {
  const version = Number(process.argv[2]);

  if (!version) {
    console.error('Please provide a version number (e.g. 35, 57)');
    process.exit(1);
  }

  console.log(await gitLog(version));
}

