import type { ReactNode, SyntheticEvent } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { useSidePanelWidth } from "metabase/common/components/ResizableSidePanel";
import { ResizeHandle } from "metabase/common/components/ResizeHandle";

import S from "./SidebarResizableBox.module.css";

const MIN_SIDEBAR_WIDTH = 400;

type SidebarResizableBoxProps = {
  /** Where the user's resized width for this sidebar is remembered. */
  storageKey: string;
  /** Width of the view's content area (excluding the sidebar itself). */
  containerWidth: number;
  defaultWidth: number;
  children?: ReactNode;
  onResizeStart?: () => void;
  onResizeStop?: () => void;
};

export function SidebarResizableBox({
  storageKey,
  containerWidth,
  defaultWidth,
  children,
  onResizeStart,
  onResizeStop,
}: SidebarResizableBoxProps) {
  const {
    width: sidebarWidth,
    setWidth: setSidebarWidth,
    persistWidth,
  } = useSidePanelWidth({
    storageKey,
    defaultWidth,
    minWidth: MIN_SIDEBAR_WIDTH,
    // The container-relative max isn't known on the first render; it's
    // enforced while dragging instead.
    maxWidth: Number.POSITIVE_INFINITY,
  });
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

  const handleResizeStop = (
    _event: SyntheticEvent,
    data: ResizeCallbackData,
  ) => {
    document.body.classList.remove(S.noSelect);
    persistWidth(data.size.width);
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
