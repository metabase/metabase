import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeStoredComment } from "../comments/draft";
import { parseCommentsReport, parseErrorMessage } from "../comments/report";
import {
  COMMENTS_POLL_MS,
  DATA_APP_COMMENTS_RUN_URL,
  DATA_APP_COMMENTS_URL,
  DATA_APP_DEV_TOKEN_HEADER,
  ID_PARAM,
} from "../constants/comments-channel";
import type {
  DataAppAgentStatus,
  DataAppComment,
  DataAppCommentDraft,
  DataAppCommentStatus,
} from "../types/comments";

import type { SubscribeToChanges } from "./use-diagnostics-feed";

const NO_COMMENTS: DataAppComment[] = [];

const UNCONFIGURED_AGENT: DataAppAgentStatus = {
  configured: false,
  command: null,
  runningCommentId: null,
};

export interface CommentsFeed {
  comments: DataAppComment[];
  agent: DataAppAgentStatus;
  loaded: boolean;
  /** Why the last write or run failed, until something clears it. */
  error: string | null;
  clearError: () => void;
  add: (draft: DataAppCommentDraft) => Promise<DataAppComment | null>;
  setStatus: (id: string, status: DataAppCommentStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Hands the comment to the configured agent command. */
  runAgent: (id: string) => Promise<void>;
}

export interface CommentsFeedOptions {
  /** Authorizes a run; the preview page is the only reader that holds it. */
  devToken: string | null;
  /** The dev server's nudge that the feed changed, so it need not be polled. */
  subscribe?: SubscribeToChanges;
}

/**
 * Mirrors the dev server's comments, and writes to them.
 *
 * As with the diagnostics feed, the endpoint is the single source of truth — the
 * dock never keeps its own list — so the author's preview, a second tab and an
 * agent reading `.data-app/comments.json` from a shell always agree on what is
 * open. Writes refresh the feed rather than patching state locally.
 */
export const useCommentsFeed = ({
  devToken,
  subscribe,
}: CommentsFeedOptions): CommentsFeed => {
  const [comments, setComments] = useState<DataAppComment[] | null>(null);
  const [agent, setAgent] = useState<DataAppAgentStatus>(UNCONFIGURED_AGENT);
  const [error, setError] = useState<string | null>(null);
  const latestRead = useRef(0);

  const readFeed = useCallback(async () => {
    const readId = ++latestRead.current;

    try {
      const response = await fetch(DATA_APP_COMMENTS_URL);
      const payload: unknown = await response.json();
      const report = parseCommentsReport(payload);

      // A slower read must not overwrite a fresher one.
      if (readId !== latestRead.current || !report) {
        return;
      }

      setComments(report.comments);
      setAgent(report.agent);
    } catch {
      // The dev server is restarting or gone; the next poll finds out.
    }
  }, []);

  useEffect(() => {
    readFeed();

    const unsubscribe = subscribe?.(() => readFeed());
    const pollId = setInterval(() => readFeed(), COMMENTS_POLL_MS);

    return () => {
      unsubscribe?.();
      clearInterval(pollId);
    };
  }, [readFeed, subscribe]);

  const request = useCallback(
    async (url: string, init: RequestInit): Promise<unknown> => {
      try {
        const response = await fetch(url, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(devToken ? { [DATA_APP_DEV_TOKEN_HEADER]: devToken } : {}),
          },
        });
        const payload: unknown =
          response.status === 204 ? null : await response.json();

        if (!response.ok) {
          setError(
            parseErrorMessage(payload) ??
              `The dev server answered ${response.status}.`,
          );

          return null;
        }

        return payload;
      } catch {
        setError("The dev server is unreachable.");

        return null;
      } finally {
        await readFeed();
      }
    },
    [devToken, readFeed],
  );

  const add = useCallback(
    async (draft: DataAppCommentDraft) => {
      const payload = await request(DATA_APP_COMMENTS_URL, {
        method: "POST",
        body: JSON.stringify(draft),
      });

      return normalizeStoredComment(payload);
    },
    [request],
  );

  const setStatus = useCallback(
    async (id: string, status: DataAppCommentStatus) => {
      await request(DATA_APP_COMMENTS_URL, {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
    },
    [request],
  );

  const remove = useCallback(
    async (id: string) => {
      await request(
        `${DATA_APP_COMMENTS_URL}?${ID_PARAM}=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
    },
    [request],
  );

  const runAgent = useCallback(
    async (id: string) => {
      await request(DATA_APP_COMMENTS_RUN_URL, {
        method: "POST",
        body: JSON.stringify({ id }),
      });
    },
    [request],
  );

  return {
    comments: comments ?? NO_COMMENTS,
    agent,
    loaded: comments !== null,
    error,
    clearError: () => setError(null),
    add,
    setStatus,
    remove,
    runAgent,
  };
};
