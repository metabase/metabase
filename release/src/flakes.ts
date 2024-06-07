// note: this file really isn't release-related, but the build tooling here is helpful for it
import { Octokit } from '@octokit/rest';
import dayjs from 'dayjs';
import { match, P } from 'ts-pattern';
import _ from 'underscore';
import "dotenv/config";
import "zx/globals";

import { sendFlakeStatusReport, slackLink } from './slack';
import type { Issue } from './types';

interface GithubProps {
  owner: string;
  repo: string;
  github: Octokit;
}

const github = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export type FlakeData = {
  suite_name: string;
  test_name: string;
  workflow_run_name: 'E2E Tests' | 'Frontend' | 'Backend' | 'Driver Tests';
  workflow_job_name: string;
  count: number; // last 7d
  count_1d: number;
  count_3d: number;
  max: string; // last error run
  max_2: string; // last error time
  branch?: string;
};

const flakiestTestsQuestionId = 18032;
const flakiestTestsOnMasterQuestionId = 18107;

export async function checkFlakes({
  owner,
  repo,
  github
}: GithubProps) {
  const flakeData = await getFlakeData();
  const flakeIssues = await getOpenFlakeIssues({ github, owner, repo });
  const recentlyClosedFlakeIssues = await getRecentlyClosedFlakeIssues({ github, owner, repo });

  for (const flake of flakeData) { // use a for loop to avoid rate limiting
    const flakeIssue = checkIfFlakeIssueExists({ test: flake, flakeIssues });
    const flakeIssueRecentlyClosed = checkIfFlakeIssueRecentlyClosed({ test: flake, flakeIssues: recentlyClosedFlakeIssues });

    if (flakeIssueRecentlyClosed) {
      console.log(`🙈 Flake issue was recently closed for\n    ${flake.test_name}`);
      continue;
    }

    if (flakeIssue) {
      console.log(`🤫 Flake issue already exists for\n    ${flake.test_name}`);
      await updateFlakeIssue({ test: flake, issue: flakeIssue, github, owner, repo });
      continue;
    }

    await createFlakeIssue({ test: flake, github, owner, repo });
  }
}

function getFlakeIssueTitle(testName: string) {
  return `[Flaky Test]: ${testName}`;
}

async function getCardData(cardId: number): Promise<FlakeData[]> {
  const cardData = await (await fetch(`https://stats.metabase.com/api/card/${cardId}/query`, {
    method: 'POST',
    // @ts-expect-error - ts doesn't know about custom headers
    headers: {
      'x-api-key': process.env.METABASE_API_KEY,
    }
  })).json();
  const colNames = cardData.data.cols.map((col: any) => col.name);

  const data: FlakeData[] = cardData.data.rows.map((row: any) => _.object(
    colNames,
    row,
  ));

  return data;
}

async function getFlakeData() {
  console.log('🔍 Fetching flake data');
  const flakiestTests = await getCardData(flakiestTestsQuestionId).catch((err) => { console.error(err); return [] });
  const flakiestTestsOnMaster = await getCardData(flakiestTestsOnMasterQuestionId);

  const flakyTests = _.uniq([...flakiestTests, ...flakiestTestsOnMaster], false, (test) => test.test_name);
  console.log(`  Found ${flakyTests.length} flaky tests`)
  return flakyTests;
}

function checkIfFlakeIssueExists({ flakeIssues, test }:  { flakeIssues: Issue[], test: FlakeData }) {
  const expectedTitle = getFlakeIssueTitle(test.test_name);
  return flakeIssues.find((issue) => issue.title === expectedTitle);
}

function checkIfFlakeIssueRecentlyClosed({ flakeIssues, test }:  { flakeIssues: Issue[], test: FlakeData }) {
  const expectedTitle = getFlakeIssueTitle(test.test_name);
  return flakeIssues.find((issue) => issue.title === expectedTitle);
}

async function getOpenFlakeIssues({github, owner, repo}: GithubProps) {
  console.log(`🔍 Fetching flake issues`);

  // we have to use paginate function or the issues will be truncated to 100
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    labels: 'flaky-test-fix',
    state: 'open',
  });

  console.log(`    Found ${issues.length} flake issues`);
  return issues as Issue[];
}

async function getRecentlyClosedFlakeIssues({github, owner, repo}: GithubProps) {
  console.log(`🔍 Fetching recently closed flake issues`);

  //we have to use paginate function or the issues will be truncated to 100
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    since: dayjs().subtract(7, 'day').toISOString(), // is 1 week too long?
    labels: 'flaky-test-fix',
    state: 'closed',
  });

  console.log(`    Found ${issues.length} recently closed flake issues`);
  return issues as Issue[];
}

function createFlakeIssue({ test, github, owner, repo }: GithubProps & { test: FlakeData }) {
  const teamTag = assignToTeam(test);

  console.log(`✅ Creating flake issue for${teamTag}\n    ${test.test_name}`)

  return github.issues.create({
    owner,
    repo,
    title: getFlakeIssueTitle(test.test_name),
    labels: ['flaky-test-fix', teamTag],
    body: getFlakeInfoString({ test }),
  });
}

function updateFlakeIssue({ test, issue, github, owner, repo }: GithubProps & { test: FlakeData, issue: Issue }) {
  if (test.count_1d === 0) {
    return;
  }
  const teamTag = assignToTeam(test);

  console.log(`💁 Updating flake issue for${teamTag}\n    ${test.test_name}`);

  return github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issue.number,
    body: `This test is still flaky\n\n${getFlakeInfoString({ test })}`,
  });
}

function getFlakeInfoString({ test }: { test: FlakeData }) {
  return `Last Flake: ${test.max}\nLast Flake Time: ${test.max_2}\nFlakes in the last day: ${test.count_1d}\nFlakes in the last 3d: ${test.count_3d}\nFlakes in the last 7d: ${test.count}`
}

const vizRegex = /dash|\bviz\b|visualization|chart/i;
const queryRegex = /question|card|quer|notebook|model|metadata|filter/i;
const adminRegex = /admin|permission|collection/i;
const embedRegex = /embed|iframe/i;

export function assignToTeam(test: FlakeData): string {
  return match(test)
    .with({ workflow_run_name: 'Driver Tests',  }, () => '.Team/QueryProcessor')
    .with({ workflow_run_name: 'Backend' }, () => '.Team/BackendComponents')
    .with({ suite_name: P.string.regex(embedRegex) }, () => '.Team/Embedding')
    .with({ test_name: P.string.regex(embedRegex) }, () => '.Team/Embedding')
    .with({ suite_name: P.string.regex(vizRegex) }, () => ".Team/DashViz")
    .with({ test_name: P.string.regex(vizRegex) }, () => ".Team/DashViz")
    .with({ suite_name: P.string.regex(adminRegex) }, () => ".Team/AdminWebapp")
    .with({ test_name: P.string.regex(adminRegex) }, () => ".Team/AdminWebapp")
    .with({ suite_name: P.string.regex(queryRegex) }, () => ".Team/QueryingComponents")
    .with({ test_name: P.string.regex(queryRegex) }, () => ".Team/QueryingComponents")
    .otherwise(() => '.Team/AdminWebapp');
}

const summarizeOpenFlakes = async ({ owner, repo, github }: GithubProps) => {
  const flakeIssues = await getOpenFlakeIssues({ github, owner, repo });

  const flakeIssuesByTeam = _.groupBy(flakeIssues, (issue) => {
    const teamTag = issue.labels.find((label) => label.name.startsWith('.Team/'));
    return teamTag?.name || '.Team/Unknown Team';
  });

  return Object.entries(flakeIssuesByTeam)
    .map(([team, issues]) => [team, issues.length])
    .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
    .map(([team, issueCount]) => (
      `${issueCount} flake issues open for ${flakyTestListLink(team)}`)
    )
    .filter(m => !m.includes('Unknown'))
    .join('\n');
}

const summarizeClosedFlakes = async ({ owner, repo, github }: GithubProps) => {
  const flakeIssues = await getRecentlyClosedFlakeIssues({ github, owner, repo });

  const flakeIssuesByTeam = _.groupBy(flakeIssues, (issue) => {
    const teamTag = issue.labels.find((label) => label.name.startsWith('.Team/'));
    return teamTag?.name || '.Team/Unknown Team';
  });

  return Object.entries(flakeIssuesByTeam)
    .map(([team, issues]) => [team, issues.length])
    .sort((a, b) => b[1] - a[1])
    .map(([team, issueCount]) => (
      `${issueCount} flake issues closed by ${team.replace('.Team/', '')}`)
    )
    .filter(m => !m.includes('Unknown'))
    .join('\n');
}

function flakyTestListLink(teamTag: string) {
  const teamName = teamTag.replace('.Team/', '');
  return slackLink(
    teamName,
    `https://github.com/metabase/metabase/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3Aflaky-test-fix+label%3A.Team%2F${teamName}`
  );
}

export async function summarizeFlakes({ owner, repo, github, channelName }: GithubProps & { channelName: string}) {
  const openFlakeInfo = await summarizeOpenFlakes({ owner, repo, github });
  const closedFlakeInfo = await summarizeClosedFlakes({ owner, repo, github });

  await sendFlakeStatusReport({
    channelName,
    openFlakeInfo,
    closedFlakeInfo,
  });
}

// Test Code
// checkFlakes({ owner: 'metabase', repo: 'metabase', github })
// summarizeFlakes({ owner: 'metabase', repo: 'metabase', github, channelName: 'bot-testing' })

