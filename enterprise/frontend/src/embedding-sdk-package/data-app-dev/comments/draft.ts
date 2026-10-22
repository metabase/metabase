import {
  DATA_APP_AGENT_MAX_OUTPUT_CHARS,
  DATA_APP_COMMENT_MAX_BODY_CHARS,
  DATA_APP_COMMENT_MAX_TARGET_CHARS,
} from "../constants/comments-channel";
import type {
  DataAppAgentRun,
  DataAppAgentRunStatus,
  DataAppComment,
  DataAppCommentDraft,
  DataAppCommentRect,
  DataAppCommentSource,
  DataAppCommentTarget,
} from "../types/comments";

const MAX_COMPONENT_PATH = 8;

const isAgentRunStatus = (value: unknown): value is DataAppAgentRunStatus =>
  value === "running" || value === "done" || value === "failed";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const asText = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() !== ""
    ? truncate(value.trim(), max)
    : null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeRect = (value: unknown): DataAppCommentRect => {
  const rect = isRecord(value) ? value : {};

  return {
    x: asFiniteNumber(rect.x) ?? 0,
    y: asFiniteNumber(rect.y) ?? 0,
    width: asFiniteNumber(rect.width) ?? 0,
    height: asFiniteNumber(rect.height) ?? 0,
  };
};

const normalizeSource = (value: unknown): DataAppCommentSource | null => {
  if (!isRecord(value)) {
    return null;
  }

  const file = asText(value.file, DATA_APP_COMMENT_MAX_TARGET_CHARS);
  const line = asFiniteNumber(value.line);

  return file && line !== null
    ? { file, line, column: asFiniteNumber(value.column) }
    : null;
};

const normalizeComponentPath = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((name): name is string => typeof name === "string")
        .map((name) => truncate(name, 100))
        .slice(0, MAX_COMPONENT_PATH)
    : [];

const normalizeTarget = (value: unknown): DataAppCommentTarget => {
  const target = isRecord(value) ? value : {};
  const viewport = isRecord(target.viewport) ? target.viewport : {};

  return {
    kind: target.kind === "region" ? "region" : "element",
    label:
      asText(target.label, 200) ??
      asText(target.selector, 200) ??
      "the app’s UI",
    selector: asText(target.selector, DATA_APP_COMMENT_MAX_TARGET_CHARS) ?? "",
    componentPath: normalizeComponentPath(target.componentPath),
    source: normalizeSource(target.source),
    rect: normalizeRect(target.rect),
    viewport: {
      width: asFiniteNumber(viewport.width) ?? 0,
      height: asFiniteNumber(viewport.height) ?? 0,
    },
    route: asText(target.route, 500) ?? "/",
    text: asText(target.text, DATA_APP_COMMENT_MAX_TARGET_CHARS),
    html: asText(target.html, DATA_APP_COMMENT_MAX_TARGET_CHARS),
  };
};

/**
 * Validates and bounds what a page (or a shell `curl`) posted as a comment.
 *
 * Returns `null` only when the comment itself is missing — a body is the one
 * part no sensible default can stand in for. Everything about the selection is
 * best-effort: a target the page could not fully describe still leaves a comment
 * worth reading, so missing fields fall back instead of rejecting the write.
 */
export const normalizeCommentDraft = (
  value: unknown,
): DataAppCommentDraft | null => {
  if (!isRecord(value)) {
    return null;
  }

  const body = asText(value.body, DATA_APP_COMMENT_MAX_BODY_CHARS);

  return body ? { body, target: normalizeTarget(value.target) } : null;
};

const normalizeAgentRun = (value: unknown): DataAppAgentRun | null => {
  if (!isRecord(value)) {
    return null;
  }

  const command = asText(value.command, DATA_APP_COMMENT_MAX_TARGET_CHARS);

  if (!command) {
    return null;
  }

  return {
    command,
    status: isAgentRunStatus(value.status) ? value.status : "done",
    startedAt: asFiniteNumber(value.startedAt) ?? 0,
    finishedAt: asFiniteNumber(value.finishedAt),
    exitCode: asFiniteNumber(value.exitCode),
    output: asText(value.output, DATA_APP_AGENT_MAX_OUTPUT_CHARS) ?? "",
  };
};

/**
 * Validates one comment as stored on disk. `.data-app/comments.json` is a file
 * an agent is invited to read and rewrite, so anything in it is untrusted input:
 * an entry without an id or a body is dropped, and the rest is bounded like a
 * fresh draft.
 */
export const normalizeStoredComment = (
  value: unknown,
): DataAppComment | null => {
  if (!isRecord(value)) {
    return null;
  }

  const draft = normalizeCommentDraft(value);
  const id = asText(value.id, 100);

  if (!draft || !id) {
    return null;
  }

  const status = value.status === "resolved" ? "resolved" : "open";

  return {
    ...draft,
    id,
    status,
    createdAt: asFiniteNumber(value.createdAt) ?? Date.now(),
    resolvedAt: status === "resolved" ? asFiniteNumber(value.resolvedAt) : null,
    agentRun: normalizeAgentRun(value.agentRun),
  };
};
