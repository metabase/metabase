/* eslint-disable i18next/no-literal-string */
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { DATA_APP_AGENT_CMD_ENV } from "../../constants/comments-channel";
import type {
  DataAppAgentStatus,
  DataAppCommentRect,
  DataAppCommentTarget,
} from "../../types/comments";

import S from "./CommentDock.module.css";
import { CommentTargetSummary } from "./CommentTargetSummary";

const CARD_WIDTH = 380;

const GAP = 8;

interface Props {
  target: DataAppCommentTarget;
  agent: DataAppAgentStatus;
  onSubmit: (body: string, handToAgent: boolean) => void;
  onCancel: () => void;
}

/**
 * Where the composer sits: under the selection, or above it when there is no
 * room below, and never past the edge of the viewport.
 */
export const getComposerPosition = (
  rect: DataAppCommentRect,
  viewport: { width: number; height: number },
  cardHeight: number,
): { left: number; top: number } => {
  const below = rect.y + rect.height + GAP;
  const fitsBelow = below + cardHeight <= viewport.height - GAP;

  return {
    left: Math.max(GAP, Math.min(rect.x, viewport.width - CARD_WIDTH - GAP)),
    top: fitsBelow ? below : Math.max(GAP, rect.y - cardHeight - GAP),
  };
};

/** The comment being written about a selection the author just made. */
export const CommentComposer = ({
  target,
  agent,
  onSubmit,
  onCancel,
}: Props) => {
  const [body, setBody] = useState("");
  const [handToAgent, setHandToAgent] = useState(agent.configured);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(240);

  useEffect(() => {
    const height = cardRef.current?.offsetHeight;

    if (height) {
      setCardHeight(height);
    }
  }, [agent.configured]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const submit = () => {
    if (body.trim() !== "") {
      onSubmit(body.trim(), handToAgent);
    }
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const position = getComposerPosition(
    target.rect,
    { width: window.innerWidth, height: window.innerHeight },
    cardHeight,
  );

  return (
    <>
      <div
        className={S.Highlight}
        style={{
          left: target.rect.x,
          top: target.rect.y,
          width: target.rect.width,
          height: target.rect.height,
        }}
      />

      <div
        ref={cardRef}
        className={`${S.Card} ${S.Composer}`}
        style={position}
        data-testid="data-app-comment-composer"
      >
        <div className={S.CardHeader}>
          <span className={S.CardTitle}>Comment on {target.label}</span>
        </div>

        <CommentTargetSummary target={target} />

        <textarea
          autoFocus
          className={S.Textarea}
          placeholder="What should change here?"
          aria-label="Comment"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onTextareaKeyDown}
        />

        {agent.configured ? (
          <label className={S.Checkbox}>
            <input
              type="checkbox"
              checked={handToAgent}
              onChange={(event) => setHandToAgent(event.target.checked)}
            />
            Hand it to {agent.command} now
          </label>
        ) : (
          <div className={S.Target}>
            Set {DATA_APP_AGENT_CMD_ENV} in .env.local to have a model pick
            comments up automatically. Until then, any agent can read them from
            the comments feed.
          </div>
        )}

        <div className={S.Row}>
          <button
            type="button"
            className={S.Primary}
            disabled={body.trim() === ""}
            onClick={submit}
          >
            Comment
          </button>
          <button type="button" className={S.Secondary} onClick={onCancel}>
            Cancel
          </button>
          <span className={S.Spacer} />
          <span className={S.Target}>⌘⏎</span>
        </div>
      </div>
    </>
  );
};
