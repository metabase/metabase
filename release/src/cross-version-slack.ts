/**
 * Slack notification helpers for cross-version migration test failures.
 *
 * buildSlackPayload is a pure function (for testability).
 * sendCrossVersionSlackNotification handles the posting via @slack/web-api.
 */
import { WebClient } from "@slack/web-api";

export interface FailureResult {
  phase: "migration" | "e2e" | "unknown";
  source: string;
  target: string;
  detail: string;
  jobUrl?: string;
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

export interface FailedJob {
  name: string;
  url: string;
}

// Red for migration failures, yellow for e2e-only/unknown
const COLOR_MIGRATION = "#f85149";
const COLOR_E2E = "#ffce33";

/**
 * Parse source and target versions from a matrix job name.
 * e.g. "test-matrix (HEAD, v1.59.x)" -> { source: "HEAD", target: "v1.59.x" }
 */
export const parseJobName = (
  name: string,
): { source: string; target: string } | null => {
  const match = name.match(/\(([^,]+),\s*([^)]+)\)/);
  if (!match) {
    return null;
  }
  return { source: match[1], target: match[2] };
};

/**
 * Build a list of FailureResults from failed jobs and optional artifact data.
 * Each failed job becomes a result. Artifact data enriches with phase/detail.
 */
export const buildFailureResults = (
  failedJobs: FailedJob[],
  artifactData: Map<string, FailureResult>,
): FailureResult[] => {
  return failedJobs.map(job => {
    const parsed = parseJobName(job.name);
    if (!parsed) {
      return {
        phase: "unknown" as const,
        source: "?",
        target: "?",
        detail: job.name,
        jobUrl: job.url,
      };
    }

    const key = `${parsed.source}-${parsed.target}`;
    const artifact = artifactData.get(key);

    if (artifact) {
      return { ...artifact, jobUrl: job.url };
    }

    return {
      phase: "unknown" as const,
      source: parsed.source,
      target: parsed.target,
      detail: "check job logs for details",
      jobUrl: job.url,
    };
  });
};

const formatFailureItem = (f: FailureResult): string => {
  const versions = f.jobUrl
    ? `<${f.jobUrl}|${f.source} → ${f.target}>`
    : `${f.source} → ${f.target}`;
  return `• ${versions} — ${f.detail}`;
};

export const buildSlackPayload = (
  failures: FailureResult[],
  runUrl: string,
): SlackPayload => {
  const migration = failures.filter(f => f.phase === "migration");
  const e2e = failures.filter(f => f.phase === "e2e");
  const unknown = failures.filter(f => f.phase === "unknown");

  const attachmentBlocks: SlackBlock[] = [];

  if (migration.length > 0) {
    const items = migration.map(formatFailureItem).join("\n");
    attachmentBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:rotating_light: *Migration failures*\n${items}`,
      },
    });
  }

  if (e2e.length > 0) {
    const items = e2e.map(formatFailureItem).join("\n");
    attachmentBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:test_tube: *E2E failures*\n${items}`,
      },
    });
  }

  if (unknown.length > 0) {
    const items = unknown.map(formatFailureItem).join("\n");
    attachmentBlocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *Other failures*\n${items}`,
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
