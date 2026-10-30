// Keeps one open Linear issue per scheduled check, found by its title.
// A non-empty report opens the issue or replaces its description; an empty one closes it with a comment.
// Slack hears when it opens or closes, and on an update when the caller has something to say.
//
// Needs LINEAR_API_KEY, LINEAR_TEAM_ID, SLACK_BOT_TOKEN and SLACK_CHANNEL in the environment.

type Issue = { id: string; identifier: string; url: string };

export type ReportIssueOptions = {
  title: string;
  /** Markdown description, or an empty string when the check passed. */
  report: string;
  /** Slack message when the issue opens. */
  opened: (link: string) => string;
  /** Slack message when a report replaces the open issue's description, if any. */
  updated?: (link: string) => string | undefined;
  /** Slack message when the issue closes. */
  closed: (link: string) => string;
  /** Comment left on the issue when it closes. */
  closedComment: string;
};

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
  // The GraphQL API answers with `data` or `errors`, checked below.
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
  // Slack answers every call with `ok`, and `error` when it is false.
  const body = (await response.json()) as { ok: boolean; error?: string };
  if (!body.ok) {
    throw new Error(`Slack API error: ${body.error}`);
  }
}

const link = (issue: Issue) => `<${issue.url}|${issue.identifier}>`;

export async function reportIssue({
  title,
  report,
  opened,
  updated,
  closed,
  closedComment,
}: ReportIssueOptions) {
  const teamId = process.env.LINEAR_TEAM_ID;

  const { issues } = await linear<{ issues: { nodes: Issue[] } }>(
    `query($teamId: ID!, $title: String!) {
      issues(first: 1, filter: {
        team: { id: { eq: $teamId } },
        title: { eq: $title },
        state: { type: { nin: ["completed", "canceled"] } }
      }) { nodes { id identifier url } }
    }`,
    { teamId, title },
  );
  const open = issues.nodes[0];

  if (report && open) {
    await linear(
      `mutation($id: String!, $description: String!) {
        issueUpdate(id: $id, input: { description: $description }) { success }
      }`,
      { id: open.id, description: report },
    );
    const text = updated?.(link(open));
    if (text) {
      await slack(text);
    }
    console.log(`Updated ${open.identifier}`);
  } else if (report) {
    const { issueCreate } = await linear<{ issueCreate: { issue: Issue } }>(
      `mutation($teamId: String!, $title: String!, $description: String!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
          issue { id identifier url }
        }
      }`,
      { teamId, title, description: report },
    );
    await slack(opened(link(issueCreate.issue)));
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
      { id: open.id, stateId: team.states.nodes[0].id, body: closedComment },
    );
    await slack(closed(link(open)));
    console.log(`Closed ${open.identifier}`);
  }
}
