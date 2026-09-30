import type { ReactNode, SyntheticEvent } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { useSidePanelWidth } from "metabase/common/components/ResizableSidePanel";
import { ResizeHandle } from "metabase/common/components/ResizeHandle";

import S from "./SidebarResizableBox.module.css";

const MIN_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 512;

type SidebarResizableBoxProps = {
  /** Where the user's resized width for this sidebar is remembered. */
  storageKey: string;
  containerWidth: number;
  children?: ReactNode;
  onResizeStart: () => void;
  onResizeStop: () => void;
};

export function SidebarResizableBox({
  storageKey,
  containerWidth,
  children,
  onResizeStart,
  onResizeStop,
}: SidebarResizableBoxProps) {
  const maxSidebarWidth = Math.max(containerWidth / 2, MIN_SIDEBAR_WIDTH);
  const { width, setWidth, persistWidth } = useSidePanelWidth({
    storageKey,
    defaultWidth: DEFAULT_SIDEBAR_WIDTH,
    minWidth: MIN_SIDEBAR_WIDTH,
    // The container-relative max isn't known on the first render; it's
    // enforced while dragging instead.
    maxWidth: Number.POSITIVE_INFINITY,
  });

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setWidth(data.size.width);
  };

  const handleResizeStop = (
    _event: SyntheticEvent,
    data: ResizeCallbackData,
  ) => {
    persistWidth(data.size.width);
    onResizeStop();
  };

  return (
    <ResizableBox
      className={S.resizableBox}
      width={width}
      minConstraints={[MIN_SIDEBAR_WIDTH, 0]}
      maxConstraints={[maxSidebarWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<ResizeHandle handleAxis="w" />}
      onResizeStart={onResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      {children}
    </ResizableBox>
  );
}
