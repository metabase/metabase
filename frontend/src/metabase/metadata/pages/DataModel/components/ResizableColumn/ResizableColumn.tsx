import type { ReactNode } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import { ResizeHandle } from "../ResizeHandle";

interface Props
  extends Pick<
    ResizableBoxProps,
    "onResize" | "onResizeStart" | "onResizeStop"
  > {
  children: ReactNode;
  className?: string;
  constraints: { min: number; max: number };
  handlePosition?: "left" | "right";
  height: number;
  width: number;
}

export const ResizableColumn = ({
  children,
  className,
  constraints,
  handlePosition = "right",
  height,
  width,
  onResize,
  onResizeStart,
  onResizeStop,
}: Props) => {
  return (
    <ResizableBox
      axis="x"
      className={className}
      handle={<ResizeHandle handlePosition={handlePosition} />}
      height={height}
      maxConstraints={[constraints.max, height]}
      minConstraints={[constraints.min, height]}
      resizeHandles={handlePosition === "left" ? ["w"] : ["e"]}
      width={width}
      onResize={onResize}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      {children}
    </ResizableBox>
  );
};
