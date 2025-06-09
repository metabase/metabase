import type { ReactNode } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import { ResizeHandle } from "../ResizeHandle";

interface Props
  extends Pick<
    ResizableBoxProps,
    "onResize" | "onResizeStart" | "onResizeStop"
  > {
  children: ReactNode;
  constraints: { min: number; max: number };
  height: number;
  width: number;
}

export const ResizableColumn = ({
  children,
  constraints,
  height,
  width,
  onResize,
  onResizeStart,
  onResizeStop,
}: Props) => {
  return (
    <ResizableBox
      axis="x"
      handle={<ResizeHandle />}
      height={height}
      maxConstraints={[constraints.max, height]}
      minConstraints={[constraints.min, height]}
      resizeHandles={["e"]}
      width={width}
      onResize={onResize}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      {children}
    </ResizableBox>
  );
};
