// note: this file really isn't release-related, but the build tooling here is helpful for it
import { Octokit } from '@octokit/rest';
import { match, P } from 'ts-pattern';
import _ from 'underscore';
import "dotenv/config";
import "zx/globals";

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
  const flakeIssues = await getFlakeIssues({ github, owner, repo });

  for (const flake of flakeData) { // use a for loop to avoid rate limiting
    const issue = checkIfFlakeIssueExists({ test: flake, flakeIssues });
    // TODO check if issue recently closed

    if (!issue) {
      await createFlakeIssue({ test: flake, github, owner, repo });
    } else {
      console.log(`🤫 Flake issue already exists for\n    ${flake.test_name}`);
      // maybe comment that it's still flaky?
    }
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
  const flakiestTests = await getCardData(flakiestTestsQuestionId);
  const flakiestTestsOnMaster = await getCardData(flakiestTestsOnMasterQuestionId);

  return _.uniq([...flakiestTests, ...flakiestTestsOnMaster], false, (test) => test.test_name);
}

function checkIfFlakeIssueExists({ flakeIssues, test }:  { flakeIssues: { title: string; }[], test: FlakeData }) {
  const expectedTitle = getFlakeIssueTitle(test.test_name);
  return flakeIssues.some((issue) => issue.title === expectedTitle);
}

async function getFlakeIssues({github, owner, repo}: GithubProps) {
  const title = getFlakeIssueTitle('');
  const { data: { items } } = await github.rest.search.issuesAndPullRequests({
    q: `repo:${owner}/${repo} type:issue is:open in:title ${title}`,
    per_page: 100,
  });

  return items.filter((issue) => issue.title.includes(title));
}

function createFlakeIssue({ test, github, owner, repo }: GithubProps & { test: FlakeData }) {
  const teamTag = assignToTeam(test);

  console.log(`✅ Creating flake issue for${teamTag}\n    ${test.test_name}`)

  return github.issues.create({
    owner,
    repo,
    title: getFlakeIssueTitle(test.test_name),
    labels: ['flaky-test-fix', teamTag],
    body: `Last Flake: ${test.max}\nLast Flake Time: ${test.max_2}\nFlakes in the last day: ${test.count_1d}\nFlakes in the last 3d: ${test.count_3d}\nFlakes in the last 7d: ${test.count}`
  });
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

// Test Code
// checkFlakes({ owner: 'metabase', repo: 'metabase', github })
