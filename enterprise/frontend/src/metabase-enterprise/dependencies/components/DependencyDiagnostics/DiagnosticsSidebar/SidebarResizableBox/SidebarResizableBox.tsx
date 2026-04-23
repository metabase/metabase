import type { ReactNode } from "react";
import { ResizableBox } from "react-resizable";

import { ResizeHandle } from "metabase/common/components/ResizeHandle";

import S from "./SidebarResizableBox.module.css";

const MIN_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 512;

type SidebarResizableBoxProps = {
  containerWidth: number;
  defaultWidth?: number;
  children?: ReactNode;
  onResizeStart: () => void;
  onResizeStop: () => void;
};

export function SidebarResizableBox({
  containerWidth,
  defaultWidth = DEFAULT_SIDEBAR_WIDTH,
  children,
  onResizeStart,
  onResizeStop,
}: SidebarResizableBoxProps) {
  const maxSidebarWidth = Math.max(containerWidth / 2, MIN_SIDEBAR_WIDTH);

  return (
    <ResizableBox
      className={S.resizableBox}
      width={defaultWidth}
      minConstraints={[MIN_SIDEBAR_WIDTH, 0]}
      maxConstraints={[maxSidebarWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<ResizeHandle handleAxis="w" />}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
    >
      {children}
    </ResizableBox>
  );
}
