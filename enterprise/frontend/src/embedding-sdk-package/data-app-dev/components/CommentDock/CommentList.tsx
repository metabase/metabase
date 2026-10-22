/* eslint-disable i18next/no-literal-string */
import { formatCommentPrompt } from "../../comments/prompt";
import { DATA_APP_COMMENTS_URL } from "../../constants/comments-channel";
import type {
  DataAppAgentStatus,
  DataAppComment,
  DataAppCommentStatus,
} from "../../types/comments";

import S from "./CommentDock.module.css";
import { CommentTargetSummary } from "./CommentTargetSummary";

interface Props {
  comments: DataAppComment[];
  agent: DataAppAgentStatus;
  error: string | null;
  appSlug: string;
  appRoot: string | null;
  onSetStatus: (id: string, status: DataAppCommentStatus) => void;
  onRemove: (id: string) => void;
  onRunAgent: (id: string) => void;
  onHighlight: (comment: DataAppComment | null) => void;
  onClose: () => void;
}

const formatRun = (comment: DataAppComment): string => {
  const run = comment.agentRun;

  if (!run) {
    return "";
  }

  if (run.status === "running") {
    return `${run.command} is working on it…`;
  }

  return run.status === "done"
    ? `${run.command} finished.`
    : `${run.command} failed${run.exitCode != null ? ` (exit ${run.exitCode})` : ""}.`;
};

const AgentRunDetails = ({ comment }: { comment: DataAppComment }) =>
  comment.agentRun && (
    <div className={S.AgentRun}>
      {formatRun(comment)}
      {comment.agentRun.output !== "" && (
        <details>
          <summary>Output</summary>
          <pre className={S.AgentOutput}>{comment.agentRun.output}</pre>
        </details>
      )}
    </div>
  );

/**
 * Every comment left on this app, newest last, with what the configured agent
 * did about it.
 *
 * Each comment also carries its prompt verbatim, so an author whose model has no
 * CLI — or who would rather drive it themselves — can copy it into any chat and
 * get the same change. Nothing about the feature assumes a particular model.
 */
export const CommentList = ({
  comments,
  agent,
  error,
  appSlug,
  appRoot,
  onSetStatus,
  onRemove,
  onRunAgent,
  onHighlight,
  onClose,
}: Props) => (
  <div className={S.Card} data-testid="data-app-comment-list">
    <div className={S.CardHeader}>
      <span className={S.CardTitle}>Comments</span>
      <span className={S.Spacer} />
      <button type="button" className={S.Link} onClick={onClose}>
        Close
      </button>
    </div>

    {comments.length === 0 && (
      <div className={S.Empty}>
        No comments yet. Pick a part of the app to leave the first one.
      </div>
    )}

    {comments.map((comment) => (
      <div
        key={comment.id}
        className={`${S.Comment} ${
          comment.status === "resolved" ? S.CommentResolved : ""
        }`}
        onMouseEnter={() => onHighlight(comment)}
        onMouseLeave={() => onHighlight(null)}
      >
        <div className={S.CardHeader}>
          <span className={S.CardTitle}>
            {comment.id} · {comment.target.label}
          </span>
        </div>

        <div className={S.CommentBody}>{comment.body}</div>

        <CommentTargetSummary target={comment.target} />

        <AgentRunDetails comment={comment} />

        <div className={S.CommentActions}>
          <button
            type="button"
            className={S.Link}
            onClick={() =>
              onSetStatus(
                comment.id,
                comment.status === "open" ? "resolved" : "open",
              )
            }
          >
            {comment.status === "open" ? "Resolve" : "Reopen"}
          </button>

          {agent.configured && comment.agentRun?.status !== "running" && (
            <button
              type="button"
              className={S.Link}
              onClick={() => onRunAgent(comment.id)}
            >
              Hand to {agent.command}
            </button>
          )}

          <button
            type="button"
            className={S.Link}
            onClick={() => onRemove(comment.id)}
          >
            Delete
          </button>
        </div>

        <details>
          <summary className={S.Link}>Prompt for any model</summary>
          <pre className={S.AgentOutput}>
            {formatCommentPrompt(comment, {
              appSlug,
              appRoot: appRoot ?? ".",
              previewOrigin: window.location.origin,
            })}
          </pre>
        </details>
      </div>
    ))}

    {error && <div className={S.Error}>{error}</div>}

    <div className={S.Target}>
      Any agent can read these at {window.location.origin}
      {DATA_APP_COMMENTS_URL} or in .data-app/comments.json
    </div>
  </div>
);
