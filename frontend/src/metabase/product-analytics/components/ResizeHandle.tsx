import { useRef } from "react";

import S from "./ResizeHandle.module.css";

type ResizeHandleProps = {
  /** Positions the strip on the panel's right edge. */
  className: string;
  /** The width when a drag starts. */
  getWidth: () => number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
};

/** A strip on a panel's right edge. Dragging it sets the panel's width. */
export const ResizeHandle = ({
  className,
  getWidth,
  minWidth,
  maxWidth,
  onResize,
}: ResizeHandleProps) => {
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  return (
    <div
      className={className}
      role="separator"
      aria-orientation="vertical"
      style={{ cursor: "col-resize" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStartRef.current = { x: event.clientX, width: getWidth() };
        // The drag crosses text everywhere; keep it from selecting any.
        document.body.classList.add(S.resizing);
      }}
      onPointerMove={(event) => {
        const dragStart = dragStartRef.current;
        if (dragStart !== null) {
          const width = dragStart.width + event.clientX - dragStart.x;
          onResize(Math.max(minWidth, Math.min(maxWidth, width)));
        }
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        dragStartRef.current = null;
        document.body.classList.remove(S.resizing);
      }}
    />
  );
};
