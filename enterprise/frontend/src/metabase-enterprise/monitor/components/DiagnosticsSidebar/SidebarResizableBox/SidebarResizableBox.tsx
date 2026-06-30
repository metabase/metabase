import { type ReactNode, type SyntheticEvent, useState } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

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
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const maxSidebarWidth = Math.max(
    (containerWidth + sidebarWidth) / 2,
    MIN_SIDEBAR_WIDTH,
  );

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setSidebarWidth(data.size.width);
  };

  return (
    <ResizableBox
      className={S.resizableBox}
      width={sidebarWidth}
      minConstraints={[MIN_SIDEBAR_WIDTH, 0]}
      maxConstraints={[maxSidebarWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<ResizeHandle handleAxis="w" />}
      onResizeStart={onResizeStart}
      onResize={handleResize}
      onResizeStop={onResizeStop}
    >
      {children}
    </ResizableBox>
  );
}
