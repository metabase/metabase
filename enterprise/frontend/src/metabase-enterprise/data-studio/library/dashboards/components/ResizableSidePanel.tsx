import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  forwardRef,
  useState,
} from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { Box } from "metabase/ui";

import S from "./LibraryDashboardOverview.module.css";

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 240;
const MAX_WIDTH = 480;

type ResizableSidePanelProps = {
  children?: ReactNode;
};

/** A right-hand side panel whose left border can be dragged to resize it. */
export function ResizableSidePanel({ children }: ResizableSidePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setWidth(data.size.width);
  };

  const handleResizeStart = () => {
    setIsResizing(true);
    document.body.classList.add(S.noSelect);
  };

  const handleResizeStop = () => {
    setIsResizing(false);
    document.body.classList.remove(S.noSelect);
  };

  return (
    <ResizableBox
      className={S.sidePanel}
      width={width}
      minConstraints={[MIN_WIDTH, 0]}
      maxConstraints={[MAX_WIDTH, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<SidePanelResizeHandle data-resizing={isResizing || undefined} />}
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      <Box className={S.sidePanelContent}>{children}</Box>
    </ResizableBox>
  );
}

type SidePanelResizeHandleProps = HTMLAttributes<HTMLDivElement> & {
  // passed by react-resizable, not a DOM attribute
  handleAxis?: string;
};

const SidePanelResizeHandle = forwardRef(function SidePanelResizeHandle(
  { handleAxis: _handleAxis, ...props }: SidePanelResizeHandleProps,
  ref: Ref<HTMLDivElement>,
) {
  return <div ref={ref} className={S.resizeHandle} {...props} />;
});
