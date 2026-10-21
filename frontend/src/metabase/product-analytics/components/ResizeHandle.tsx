import { useRef } from "react";

import S from "./ResizeHandle.module.css";

type ResizeHandleProps = {
  /** Positions the strip on the right edge it drags. */
  className: string;
  /** The width when the drag starts, read then so it can be measured. */
  getSize: () => number;
  min: number;
  max: number;
  onResize: (size: number) => void;
};

/**
 * A grab strip on a panel's right edge; dragging it sets the panel's width.
 * The panel styles the edge it sits on, e.g. darkening it on hover.
 */
export const ResizeHandle = ({
  className,
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
          const next = start.size + event.clientX - start.position;
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
