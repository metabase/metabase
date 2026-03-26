/**
 * Slack notification helpers for cross-version migration test failures.
 *
 * Pure functions that build Slack Block Kit payloads from structured
 * failure results. Used by the cross-version workflow's notify job.
 */

export interface FailureResult {
  phase: "migration" | "e2e";
  source: string;
  target: string;
  detail: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text: string }>;
}

export interface SlackPayload {
  blocks: SlackBlock[];
}

export const buildSlackPayload = (
  failures: FailureResult[],
  runUrl: string,
): SlackPayload => {
  const migration = failures.filter(f => f.phase === "migration");
  const e2e = failures.filter(f => f.phase === "e2e");

  const sections: SlackBlock[] = [];

  if (migration.length > 0) {
    const items = migration
      .map(f => `• ${f.source} → ${f.target} — ${f.detail}`)
      .join("\n");
    sections.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:rotating_light: *Migration failures*\n${items}`,
      },
    });
  }

  if (e2e.length > 0) {
    const items = e2e
      .map(f => `• ${f.source} → ${f.target} — ${f.detail}`)
      .join("\n");
    sections.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:test_tube: *E2E failures*\n${items}`,
      },
    });
  }

  if (sections.length === 0) {
    sections.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "One or more matrix jobs failed. Check the workflow run for details.",
      },
    });
  }

  sections.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${runUrl}|View full run>` }],
  });

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: ":warning: Cross-version tests failing",
          emoji: true,
        },
      },
      ...sections,
    ],
  };
};
