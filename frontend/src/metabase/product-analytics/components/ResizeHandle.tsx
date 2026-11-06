import { useRef } from "react";

import S from "./ResizeHandle.module.css";

type ResizeHandleProps = {
  /** Positions the strip on the edge it drags. */
  className: string;
  /** The edge the strip sits on. A left edge grows the panel when dragged left. */
  edge?: "left" | "right";
  /** The width when the drag starts, read then so it can be measured. */
  getSize: () => number;
  min: number;
  max: number;
  onResize: (size: number) => void;
};

/**
 * A grab strip on a panel's edge; dragging it sets the panel's width.
 * The panel styles the edge it sits on, e.g. darkening it on hover.
 */
export const ResizeHandle = ({
  className,
  edge = "right",
  getSize,
  min,
  max,
  onResize,
}: ResizeHandleProps) => {
  const dragStart = useRef<{ position: number; size: number } | null>(null);
  return (
    <div
      className={className}
      role="separator"
      aria-orientation="vertical"
      style={{ cursor: "col-resize" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = { position: event.clientX, size: getSize() };
        // The drag crosses text everywhere; keep it from selecting any.
        document.body.classList.add(S.resizing);
      }}
      onPointerMove={(event) => {
        const start = dragStart.current;
        if (start !== null) {
          const delta = event.clientX - start.position;
          const next = start.size + (edge === "left" ? -delta : delta);
          onResize(Math.max(min, Math.min(max, next)));
        }
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        dragStart.current = null;
        document.body.classList.remove(S.resizing);
      }}
    />
  );
};
