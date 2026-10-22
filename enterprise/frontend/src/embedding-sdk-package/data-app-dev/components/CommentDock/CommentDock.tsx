/* eslint-disable i18next/no-literal-string */
import cx from "classnames";
import { useState } from "react";

import { describeCommentTarget } from "../../lib/element-target";
import { locateComment } from "../../lib/locate-comment";
import { DEV_CHROME_ATTRIBUTE } from "../../lib/pick-element";
import { useCommentsFeed } from "../../lib/use-comments-feed";
import type { SubscribeToChanges } from "../../lib/use-diagnostics-feed";
import type {
  DataAppComment,
  DataAppCommentRect,
  DataAppCommentTarget,
} from "../../types/comments";

import { CommentComposer } from "./CommentComposer";
import S from "./CommentDock.module.css";
import { CommentList } from "./CommentList";
import { CommentMarkers } from "./CommentMarkers";
import { CommentPickerOverlay } from "./CommentPickerOverlay";

export interface CommentDockProps {
  appSlug: string;
  /** The app's directory, so source locations are reported relative to it. */
  appRoot?: string | null;
  /** Authorizes handing a comment to the agent; served to the page only. */
  devToken?: string | null;
  /** The dev server's nudge that the comments changed, so it need not be polled. */
  subscribe?: SubscribeToChanges;
  /** The element the app renders into. Defaults to the preview's `#root`. */
  rootElement?: Element | null;
}

type DockMode =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "composing"; target: DataAppCommentTarget }
  | { kind: "list" };

const Highlight = ({ rect }: { rect: DataAppCommentRect }) => (
  <div
    className={S.Highlight}
    style={{
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
    }}
  />
);

/**
 * The dev preview's comment control: pick a part of the running app, say what
 * should change about it, and have a coding agent make the change.
 *
 * It is deliberately model-agnostic. A comment is stored as text plus where in
 * the source the selection came from, and the dev server hands it to whatever
 * command `DATA_APP_AGENT_CMD` names — Claude Code, Codex, Cursor, Aider or a
 * script of the author's own. With no command configured, the comments are still
 * served as a feed and written to `.data-app/comments.json`, which any agent
 * already working in the repository can read.
 */
export const CommentDock = ({
  appSlug,
  appRoot = null,
  devToken = null,
  subscribe,
  rootElement,
}: CommentDockProps) => {
  const [mode, setMode] = useState<DockMode>({ kind: "idle" });
  const [highlighted, setHighlighted] = useState<DataAppComment | null>(null);
  const feed = useCommentsFeed({ devToken, subscribe });

  const appElement = rootElement ?? document.getElementById("root");
  const open = feed.comments.filter((comment) => comment.status === "open");

  const pick = (element: Element, region?: DataAppCommentRect) =>
    setMode({
      kind: "composing",
      target: describeCommentTarget(
        element,
        { appRoot, rootElement: appElement },
        region,
      ),
    });

  const submit = async (body: string, handToAgent: boolean) => {
    if (mode.kind !== "composing") {
      return;
    }

    const { target } = mode;

    setMode({ kind: "list" });

    const comment = await feed.add({ body, target });

    if (comment && handToAgent) {
      await feed.runAgent(comment.id);
    }
  };

  return (
    <div {...{ [DEV_CHROME_ATTRIBUTE]: "true" }} className={S.CommentDock}>
      {mode.kind === "picking" && (
        <CommentPickerOverlay
          rootElement={appElement}
          onPick={pick}
          onCancel={() => setMode({ kind: "idle" })}
        />
      )}

      {mode.kind === "composing" && (
        <CommentComposer
          target={mode.target}
          agent={feed.agent}
          onSubmit={submit}
          onCancel={() => setMode({ kind: "idle" })}
        />
      )}

      {(mode.kind === "picking" || mode.kind === "list") && (
        <CommentMarkers
          comments={open}
          onSelect={() => setMode({ kind: "list" })}
        />
      )}

      {highlighted && <Highlight rect={locateComment(highlighted)} />}

      {mode.kind === "list" && (
        <CommentList
          comments={feed.comments}
          agent={feed.agent}
          error={feed.error}
          appSlug={appSlug}
          appRoot={appRoot}
          onSetStatus={feed.setStatus}
          onRemove={feed.remove}
          onRunAgent={feed.runAgent}
          onHighlight={setHighlighted}
          onClose={() => {
            setHighlighted(null);
            setMode({ kind: "idle" });
          }}
        />
      )}

      <div className={S.Buttons}>
        <button
          type="button"
          className={cx(S.Toggle, {
            [S.ToggleActive]: mode.kind === "picking",
          })}
          onClick={() =>
            setMode(
              mode.kind === "picking" ? { kind: "idle" } : { kind: "picking" },
            )
          }
        >
          {mode.kind === "picking" ? "✕ Cancel" : "💬 Comment"}
        </button>

        {(open.length > 0 || mode.kind === "list") && (
          <button
            type="button"
            className={cx(S.Toggle, S.ToggleSecondary)}
            onClick={() =>
              setMode(
                mode.kind === "list" ? { kind: "idle" } : { kind: "list" },
              )
            }
          >
            {open.length} open
          </button>
        )}
      </div>
    </div>
  );
};
