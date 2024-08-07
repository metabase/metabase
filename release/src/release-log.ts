import fs from 'fs';

import { $ } from 'zx';

import { issueNumberRegex } from './linked-issues';

const NUM_COMMITS = 200;

type CommitInfo = {
  version: string,
  message: string,
  hash: string,
  date: string,
}

const tablePageTemplate = fs.readFileSync('./src/tablePageTemplate.html', 'utf8');

export async function gitLog(majorVersion: number) {
  const { stdout } = await $`git log origin/release-x.${majorVersion}.x --pretty='format:%(decorate:prefix=,suffix=)||%s||%H||%ah' -n ${NUM_COMMITS}`;
  const processedCommits = stdout.split('\n').map(processCommit);

  return buildTable(processedCommits, majorVersion);
}

function processCommit(commitLine: string): CommitInfo {
  const [refs, message, hash, date] = commitLine.split('||');
  const version = refs?.match(/(v[\d\.-RCrc]+)/)?.[1] ?? '';

  return { version, message, hash, date};
}

const issueLink = (issueNumber: string) => `https://github.com/metabase/metabase/issues/${issueNumber}`;

function linkifyIssueNumbers(message: string) {
  return message.replace(issueNumberRegex, (_, issueNumber) => {
    return `<a href="${issueLink(issueNumber)}" target="_blank">(#${issueNumber})</a>`;
  });
}

function tableRow(commit: CommitInfo) {
  return `<tr>
    <td><strong>${commit.version}</strong></td>
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

const version = Number(process.argv[2]);

if (!version) {
  console.error('Please provide a version number (e.g. 35, 57)');
  process.exit(1);
}

console.log(await gitLog(version));
