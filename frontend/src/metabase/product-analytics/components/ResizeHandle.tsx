import { useRef } from "react";

import S from "./ResizeHandle.module.css";

type ResizeHandleProps = {
  /** Positions the strip on the edge it drags. */
  className: string;
  /** "x" drags a right edge, "y" a bottom edge. */
  axis: "x" | "y";
  /** The size when the drag starts, read then so it can be measured. */
  getSize: () => number;
  min: number;
  max: number;
  onResize: (size: number) => void;
};

/**
 * A grab strip on a panel's edge; dragging it sets the panel's width or
 * height. The panel styles the edge it sits on, e.g. darkening it on hover.
 */
export const ResizeHandle = ({
  className,
  axis,
  getSize,
  min,
  max,
  onResize,
}: ResizeHandleProps) => {
  const dragStart = useRef<{ position: number; size: number } | null>(null);
  const bodyClassName = axis === "x" ? S.resizingX : S.resizingY;
  return (
    <div
      className={className}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      style={{ cursor: axis === "x" ? "col-resize" : "row-resize" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStart.current = {
          position: axis === "x" ? event.clientX : event.clientY,
          size: getSize(),
        };
        // The drag crosses text everywhere; keep it from selecting any.
        document.body.classList.add(bodyClassName);
      }}
      onPointerMove={(event) => {
        const start = dragStart.current;
        if (start !== null) {
          const position = axis === "x" ? event.clientX : event.clientY;
          const next = start.size + position - start.position;
          onResize(Math.max(min, Math.min(max, next)));
        }
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        dragStart.current = null;
        document.body.classList.remove(bodyClassName);
      }}
    />
  );
};
