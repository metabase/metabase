import type { Connect } from "vite";

import type { AgentRunner } from "../../comments/agent-runner";
import { normalizeCommentDraft } from "../../comments/draft";
import {
  type CommentPromptContext,
  formatCommentPrompt,
} from "../../comments/prompt";
import type { CommentsStore } from "../../comments/store";
import {
  DATA_APP_COMMENTS_RUN_URL,
  DATA_APP_COMMENTS_URL,
  DATA_APP_DEV_TOKEN_HEADER,
  ID_PARAM,
  STATUS_PARAM,
} from "../../constants/comments-channel";
import type {
  DataAppCommentStatus,
  DataAppCommentsReport,
} from "../../types/comments";

export interface CommentsEndpointMiddlewareOptions {
  store: CommentsStore;
  agent: AgentRunner;
  /** Proves a mutating request came from the preview page, not another site. */
  devToken: string;
  getPromptContext: (request: Connect.IncomingMessage) => CommentPromptContext;
  notifyChanged: () => void;
}

const readJsonBody = async (req: Connect.IncomingMessage): Promise<unknown> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
};

const sendJson = (
  res: Parameters<Connect.NextHandleFunction>[1],
  status: number,
  body: unknown,
): void => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body, null, 2));
};

const parseStatus = (value: string | null): DataAppCommentStatus | undefined =>
  value === "open" || value === "resolved" ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * The comments endpoints.
 *
 * `DATA_APP_COMMENTS_URL`: `GET` lists them (`?status=open` filters), `POST`
 * adds one from the page or a shell, `PATCH` resolves, reopens or edits one,
 * `DELETE` removes one (`?id=`) or all of them.
 *
 * `DATA_APP_COMMENTS_RUN_URL`: `POST {"id": "c1"}` hands that comment to the
 * configured agent command. It is the one endpoint that runs a command, so it
 * requires the dev token the preview page is served with — otherwise any page
 * open in the same browser could make the dev server run it.
 */
export const getCommentsEndpointMiddleware =
  ({
    store,
    agent,
    devToken,
    getPromptContext,
    notifyChanged,
  }: CommentsEndpointMiddlewareOptions): Connect.NextHandleFunction =>
  async (req, res, next) => {
    const [pathname, query] = (req.url ?? "").split("?");
    const params = new URLSearchParams(query);

    if (pathname === DATA_APP_COMMENTS_RUN_URL) {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end();

        return;
      }

      if (req.headers[DATA_APP_DEV_TOKEN_HEADER] !== devToken) {
        sendJson(res, 403, { error: "Missing or stale dev token." });

        return;
      }

      const body = await readJsonBody(req);
      const id = isRecord(body) ? asString(body.id) : null;
      const comment = id ? store.find(id) : null;

      if (!comment) {
        sendJson(res, 404, { error: `No comment ${id ?? ""}.` });

        return;
      }

      const result = agent.start(
        comment,
        formatCommentPrompt(comment, getPromptContext(req)),
      );

      if (!result.started) {
        sendJson(res, 409, { error: result.reason });

        return;
      }

      sendJson(res, 202, { id: comment.id, run: result.run });

      return;
    }

    if (pathname !== DATA_APP_COMMENTS_URL) {
      next();

      return;
    }

    if (req.method === "GET") {
      const report: DataAppCommentsReport = {
        comments: store.list(parseStatus(params.get(STATUS_PARAM))),
        agent: {
          configured: agent.isConfigured(),
          command: agent.getCommand(),
          runningCommentId: agent.getRunningCommentId(),
        },
        lastChangeAt: store.getLastChangeAt(),
      };

      sendJson(res, 200, report);

      return;
    }

    if (req.method === "POST") {
      const draft = normalizeCommentDraft(await readJsonBody(req));

      if (!draft) {
        sendJson(res, 400, { error: "A comment needs a body." });

        return;
      }

      const comment = store.add(draft);
      notifyChanged();

      sendJson(res, 201, comment);

      return;
    }

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const id = isRecord(body) ? asString(body.id) : null;
      const status = isRecord(body)
        ? parseStatus(asString(body.status))
        : undefined;
      const text = isRecord(body) ? asString(body.body) : null;

      const updated = id
        ? store.update(id, { status, body: text ?? undefined })
        : null;

      if (!updated) {
        sendJson(res, 404, { error: `No comment ${id ?? ""}.` });

        return;
      }

      notifyChanged();
      sendJson(res, 200, updated);

      return;
    }

    if (req.method === "DELETE") {
      const id = params.get(ID_PARAM);

      if (id && !store.remove(id)) {
        sendJson(res, 404, { error: `No comment ${id}.` });

        return;
      }

      if (!id) {
        store.clear();
      }

      notifyChanged();
      res.statusCode = 204;
      res.end();

      return;
    }

    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    res.end();
  };
