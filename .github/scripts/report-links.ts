// usage: bun report-links.ts <report.md>
// A non-empty report opens the Linear issue or replaces its description; an empty or missing one closes it.
import { existsSync, readFileSync } from "node:fs";

const TITLE = "metabase/metabase broken links report";

type Issue = { id: string; identifier: string; url: string };

async function linear<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.LINEAR_API_KEY ?? "",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: unknown };
  if (!response.ok || body.errors || !body.data) {
    throw new Error(
      `Linear API error: ${JSON.stringify(body.errors ?? response.status)}`,
    );
  }
  return body.data;
}

async function slack(text: string) {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({ channel: process.env.SLACK_CHANNEL, text }),
  });
  const body = (await response.json()) as { ok: boolean; error?: string };
  if (!body.ok) {
    throw new Error(`Slack API error: ${body.error}`);
  }
}

const file = process.argv[2];
const report =
  file && existsSync(file) ? readFileSync(file, "utf8").trim() : "";
const teamId = process.env.LINEAR_TEAM_ID;
const runUrl = process.env.RUN_URL;
const link = (issue: Issue) => `<${issue.url}|${issue.identifier}>`;

const { issues } = await linear<{ issues: { nodes: Issue[] } }>(
  `query($teamId: ID!, $title: String!) {
    issues(first: 1, filter: {
      team: { id: { eq: $teamId } },
      title: { eq: $title },
      state: { type: { nin: ["completed", "canceled"] } }
    }) { nodes { id identifier url } }
  }`,
  { teamId, title: TITLE },
);
const open = issues.nodes[0];

if (report && open) {
  await linear(
    `mutation($id: String!, $description: String!) {
      issueUpdate(id: $id, input: { description: $description }) { success }
    }`,
    { id: open.id, description: report },
  );
  console.log(`Updated ${open.identifier}`);
} else if (report) {
  const { issueCreate } = await linear<{ issueCreate: { issue: Issue } }>(
    `mutation($teamId: String!, $title: String!, $description: String!) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
        issue { id identifier url }
      }
    }`,
    { teamId, title: TITLE, description: report },
  );
  await slack(
    `:link: The weekly link check found broken links in metabase/metabase: ${link(issueCreate.issue)}`,
  );
  console.log(`Opened ${issueCreate.issue.identifier}`);
} else if (open) {
  const { team } = await linear<{
    team: { states: { nodes: { id: string }[] } };
  }>(
    `query($teamId: String!) {
      team(id: $teamId) { states(filter: { type: { eq: "completed" } }) { nodes { id } } }
    }`,
    { teamId },
  );
  await linear(
    `mutation($id: String!, $stateId: String!, $body: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { success }
      commentCreate(input: { issueId: $id, body: $body }) { success }
    }`,
    {
      id: open.id,
      stateId: team.states.nodes[0].id,
      body: `All links pass as of ${runUrl}`,
    },
  );
  await slack(
    `:white_check_mark: All links in metabase/metabase pass again, closed ${link(open)}`,
  );
  console.log(`Closed ${open.identifier}`);
}
