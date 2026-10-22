import type { DataAppComment, DataAppCommentsReport } from "../types/comments";

import { normalizeStoredComment } from "./draft";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Reads what the comments endpoint answered. Anything that is not a comment is
 * dropped rather than failing the whole read: the file behind the endpoint is
 * one an agent may have rewritten by hand.
 */
export const parseCommentsReport = (
  value: unknown,
): DataAppCommentsReport | null => {
  if (!isRecord(value) || !Array.isArray(value.comments)) {
    return null;
  }

  const agent = isRecord(value.agent) ? value.agent : {};

  return {
    comments: value.comments
      .map(normalizeStoredComment)
      .filter((comment): comment is DataAppComment => comment !== null),
    agent: {
      configured: agent.configured === true,
      command: typeof agent.command === "string" ? agent.command : null,
      runningCommentId:
        typeof agent.runningCommentId === "string"
          ? agent.runningCommentId
          : null,
    },
    lastChangeAt:
      typeof value.lastChangeAt === "number" ? value.lastChangeAt : null,
  };
};

/** The error message an endpoint answered with, when it answered with one. */
export const parseErrorMessage = (value: unknown): string | null =>
  isRecord(value) && typeof value.error === "string" ? value.error : null;
