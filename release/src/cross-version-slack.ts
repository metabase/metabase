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

// Red for migration failures, yellow for e2e
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
 * Build a list of FailureResults from failed jobs and artifact data.
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
        phase: "e2e" as const,
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
      phase: "e2e" as const,
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

const labelForPhase = (phase: "migration" | "e2e"): string =>
  phase === "migration"
    ? ":rotating_light: *Migration failures*"
    : ":test_tube: *E2E failures*";

const colorForPhase = (phase: "migration" | "e2e"): string =>
  phase === "migration" ? COLOR_MIGRATION : COLOR_E2E;

export const buildSlackPayload = (
  failures: FailureResult[],
  runUrl: string,
): SlackPayload => {
  const attachments: SlackAttachment[] = failures.map(f => ({
    color: colorForPhase(f.phase),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${labelForPhase(f.phase)}\n${formatFailureItem(f)}`,
        },
      },
    ],
  }));

  if (attachments.length === 0) {
    attachments.push({
      color: COLOR_E2E,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "One or more matrix jobs failed. Check the workflow run for details.",
          },
        },
      ],
    });
  }

  // Add "View full run" to the last attachment
  attachments[attachments.length - 1].blocks.push({
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
    ],
    attachments,
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
