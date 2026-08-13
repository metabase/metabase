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
  jobUrl?: string;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text: string }>;
}

export interface SlackPayload {
  blocks: SlackBlock[];
}

export interface FailedJob {
  name: string;
  url: string;
}

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
 * Each failed job becomes a result. Artifact data enriches with phase.
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
        jobUrl: job.url,
      };
    }

    const key = `${parsed.source}-${parsed.target}`;
    const artifact = artifactData.get(key);

    if (artifact) {
      return { phase: artifact.phase, source: artifact.source, target: artifact.target, jobUrl: job.url };
    }

    return {
      phase: "e2e" as const,
      source: parsed.source,
      target: parsed.target,
      jobUrl: job.url,
    };
  });
};

const formatFailureItem = (f: FailureResult): string => {
  const versions = f.jobUrl
    ? `<${f.jobUrl}|${f.source} → ${f.target}>`
    : `${f.source} → ${f.target}`;
  const label = f.phase === "migration" ? "migration failure" : "e2e failure";
  return `• ${versions} (${label})`;
};

export const buildSlackPayload = (
  failures: FailureResult[],
  runUrl: string,
): SlackPayload => {
  const lines = failures.map(formatFailureItem);

  if (lines.length === 0) {
    lines.push(
      "One or more matrix jobs failed. Check the workflow run for details.",
    );
  }

  return {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:warning: *Cross-version tests failing*\n${lines.join("\n")}\n<${runUrl}|View full run>`,
        },
      },
    ],
  };
};

export const sendCrossVersionSlackNotification = async (
  failures: FailureResult[],
  runUrl: string,
  slackBotToken: string,
  channel = "engineering-ci",
): Promise<void> => {
  const slack = new WebClient(slackBotToken);
  const { blocks } = buildSlackPayload(failures, runUrl);

  await slack.chat.postMessage({
    channel,
    text: "Cross-version tests failing",
    blocks,
  });
};
