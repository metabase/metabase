import { type ReactNode, type SyntheticEvent, useState } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { ResizeHandle } from "metabase/common/components/ResizeHandle";

import S from "./SidebarResizableBox.module.css";

const MIN_SIDEBAR_WIDTH = 400;

type SidebarResizableBoxProps = {
  /** Width of the view's content area (excluding the sidebar itself). */
  containerWidth: number;
  defaultWidth: number;
  children?: ReactNode;
  onResizeStart?: () => void;
  onResizeStop?: () => void;
};

export function SidebarResizableBox({
  containerWidth,
  defaultWidth,
  children,
  onResizeStart,
  onResizeStop,
}: SidebarResizableBoxProps) {
  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);
  const maxSidebarWidth = Math.max(
    (containerWidth + sidebarWidth) / 2,
    MIN_SIDEBAR_WIDTH,
  );

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setSidebarWidth(data.size.width);
  };

  const handleResizeStart = () => {
    document.body.classList.add(S.noSelect);
    onResizeStart?.();
  };

  const handleResizeStop = () => {
    document.body.classList.remove(S.noSelect);
    onResizeStop?.();
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
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      {children}
    </ResizableBox>
  );
}
