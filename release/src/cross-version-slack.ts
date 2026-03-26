/**
 * Slack notification helpers for cross-version migration test failures.
 *
 * buildSlackPayload is a pure function (for testability).
 * sendCrossVersionSlackNotification handles the posting via @slack/web-api.
 */
import { WebClient } from "@slack/web-api";

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

interface SlackAttachment {
  color: string;
  blocks: SlackBlock[];
}

export interface SlackPayload {
  blocks: SlackBlock[];
  attachments: SlackAttachment[];
}

// Red for migration failures, yellow for e2e-only
const COLOR_MIGRATION = "#f85149";
const COLOR_E2E = "#ffce33";

export const buildSlackPayload = (
  failures: FailureResult[],
  runUrl: string,
): SlackPayload => {
  const migration = failures.filter(f => f.phase === "migration");
  const e2e = failures.filter(f => f.phase === "e2e");

  const attachmentBlocks: SlackBlock[] = [];

  if (migration.length > 0) {
    const items = migration
      .map(f => `• ${f.source} → ${f.target} — ${f.detail}`)
      .join("\n");
    attachmentBlocks.push({
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
    attachmentBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:test_tube: *E2E failures*\n${items}`,
      },
    });
  }

  if (attachmentBlocks.length === 0) {
    attachmentBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "One or more matrix jobs failed. Check the workflow run for details.",
      },
    });
  }

  attachmentBlocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${runUrl}|View full run>` }],
  });

  const color = migration.length > 0 ? COLOR_MIGRATION : COLOR_E2E;

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
    ],
    attachments: [{ color, blocks: attachmentBlocks }],
  };
};

export const sendCrossVersionSlackNotification = async (
  failures: FailureResult[],
  runUrl: string,
  slackBotToken: string,
  channel = "engineering-ci",
): Promise<void> => {
  const slack = new WebClient(slackBotToken);
  const { blocks, attachments } = buildSlackPayload(failures, runUrl);

  await slack.chat.postMessage({
    channel,
    text: "Cross-version tests failing",
    blocks,
    attachments,
  });
};
