import type { HTMLAttributes, ReactNode, Ref, SyntheticEvent } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import S from "./ResizablePanel.module.css";

type ResizablePanelProps = {
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
};

/**
 * A full-height panel resized by dragging its right edge, which darkens while
 * hovered or dragged. The panel draws that edge's border itself.
 */
export function ResizablePanel({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  children,
}: ResizablePanelProps) {
  return (
    <ResizableBox
      className={S.resizable}
      width={width}
      minConstraints={[minWidth, 0]}
      maxConstraints={[maxWidth, 0]}
      axis="x"
      resizeHandles={["e"]}
      handle={<EdgeHandle />}
      onResizeStart={() => document.body.classList.add(S.noSelect)}
      onResize={(_event: SyntheticEvent, data: ResizeCallbackData) =>
        onWidthChange(data.size.width)
      }
      onResizeStop={() => document.body.classList.remove(S.noSelect)}
    >
      {children}
    </ResizableBox>
  );
}

type EdgeHandleProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>;
  /** Injected by react-resizable; kept off the DOM element */
  handleAxis?: string;
};

/** Grab area on the panel's right edge that darkens the border on hover */
function EdgeHandle({
  ref,
  handleAxis: _handleAxis,
  ...props
}: EdgeHandleProps) {
  return <div ref={ref} className={S.resizeHandle} {...props} />;
}
