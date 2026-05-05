import type { ReactNode } from "react";
import { ResizableBox } from "react-resizable";

import { ResizeHandle } from "metabase/common/components/ResizeHandle";

import S from "./SidebarResizableBox.module.css";

const MIN_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 512;

type SidebarResizableBoxProps = {
  containerWidth: number;
  children?: ReactNode;
  onResizeStart: () => void;
  onResizeStop: () => void;
};

export function SidebarResizableBox({
  containerWidth,
  children,
  onResizeStart,
  onResizeStop,
}: SidebarResizableBoxProps) {
  const maxSidebarWidth = Math.max(containerWidth / 2, MIN_SIDEBAR_WIDTH);

  return (
    <ResizableBox
      className={S.resizableBox}
      width={DEFAULT_SIDEBAR_WIDTH}
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
