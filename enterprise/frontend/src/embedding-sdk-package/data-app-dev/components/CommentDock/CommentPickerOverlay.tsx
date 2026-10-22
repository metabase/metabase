/* eslint-disable i18next/no-literal-string */
import { type MouseEvent, useEffect, useState } from "react";

import { describeElementLabel } from "../../lib/dom-selector";
import {
  findAppElementAtPoint,
  findRegionAnchor,
} from "../../lib/pick-element";
import type { DataAppCommentRect } from "../../types/comments";

import S from "./CommentDock.module.css";

/** Below this, a drag is a click: picking one element, not a region. */
const DRAG_THRESHOLD_PX = 8;

interface Props {
  /** The element the app renders into; nothing outside it can be picked. */
  rootElement: Element | null;
  onPick: (element: Element, region?: DataAppCommentRect) => void;
  onCancel: () => void;
}

const toRect = (
  from: { x: number; y: number },
  to: { x: number; y: number },
): DataAppCommentRect => ({
  x: Math.min(from.x, to.x),
  y: Math.min(from.y, to.y),
  width: Math.abs(to.x - from.x),
  height: Math.abs(to.y - from.y),
});

const isDrag = (rect: DataAppCommentRect): boolean =>
  rect.width > DRAG_THRESHOLD_PX || rect.height > DRAG_THRESHOLD_PX;

/**
 * Lets the author point at the part of the running app they want to comment on:
 * click one element, or drag a box around several and have the innermost element
 * holding all of them stand in for them.
 */
export const CommentPickerOverlay = ({
  rootElement,
  onPick,
  onCancel,
}: Props) => {
  const [hovered, setHovered] = useState<Element | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragRect, setDragRect] = useState<DataAppCommentRect | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const handleMouseMove = (event: MouseEvent) => {
    if (dragStart) {
      setDragRect(toRect(dragStart, { x: event.clientX, y: event.clientY }));

      return;
    }

    setHovered(
      findAppElementAtPoint(event.clientX, event.clientY, rootElement),
    );
  };

  const handleMouseDown = (event: MouseEvent) => {
    setDragStart({ x: event.clientX, y: event.clientY });
    setDragRect(null);
  };

  const handleMouseUp = (event: MouseEvent) => {
    const rect = dragStart
      ? toRect(dragStart, { x: event.clientX, y: event.clientY })
      : null;

    setDragStart(null);
    setDragRect(null);

    if (rect && isDrag(rect)) {
      const anchor = findRegionAnchor(rect, rootElement);

      if (anchor) {
        onPick(anchor, rect);
      }

      return;
    }

    const element =
      findAppElementAtPoint(event.clientX, event.clientY, rootElement) ??
      hovered;

    if (element) {
      onPick(element);
    }
  };

  const highlight = dragRect ?? hovered?.getBoundingClientRect() ?? null;

  return (
    <>
      <div
        className={S.Overlay}
        data-testid="data-app-comment-picker"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      />

      {highlight && (
        <div
          className={S.Highlight}
          style={{
            left: highlight.x,
            top: highlight.y,
            width: highlight.width,
            height: highlight.height,
          }}
        >
          {!dragRect && hovered && (
            <span className={S.HighlightLabel}>
              {describeElementLabel(hovered)}
            </span>
          )}
        </div>
      )}

      <div className={S.Hint}>
        Click a part of the app to comment on it, or drag a box around several ·
        Esc to cancel
      </div>
    </>
  );
};
