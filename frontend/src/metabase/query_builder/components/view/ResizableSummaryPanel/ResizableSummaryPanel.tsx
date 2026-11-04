import { type ReactNode, type SyntheticEvent, useState } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { ResizeHandle } from "metabase/common/components/ResizeHandle";
import { Box } from "metabase/ui";

import S from "./ResizableSummaryPanel.module.css";

const DEFAULT_PANEL_WIDTH = 650;
const MIN_PANEL_WIDTH = 320;
const MIN_RESULTS_WIDTH = 320;

type ResizableSummaryPanelProps = {
  containerWidth: number;
  children: ReactNode;
  "data-testid"?: string;
};

/**
 * The right-hand panel the summary sidebar renders in, resizable from its left edge. It starts
 * at 650px and always leaves the results some room. While it's being dragged, its content carries
 * `data-resizing`, so the content can hold off animations that would trail the drag.
 */
export function ResizableSummaryPanel({
  containerWidth,
  children,
  "data-testid": testId,
}: ResizableSummaryPanelProps) {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  // the container measures 0 until its first layout; clamping to that would flash a narrow panel
  const maxWidth =
    containerWidth > 0
      ? Math.max(containerWidth - MIN_RESULTS_WIDTH, MIN_PANEL_WIDTH)
      : Infinity;

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setWidth(data.size.width);
  };

  return (
    <ResizableBox
      className={S.panel}
      data-testid={testId}
      width={Math.min(width, maxWidth)}
      minConstraints={[MIN_PANEL_WIDTH, 0]}
      maxConstraints={[maxWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<ResizeHandle handleAxis="w" />}
      onResizeStart={() => {
        setIsResizing(true);
        document.body.classList.add(S.isResizing);
      }}
      onResize={handleResize}
      onResizeStop={() => {
        setIsResizing(false);
        document.body.classList.remove(S.isResizing);
      }}
    >
      <Box
        className={S.content}
        data-resizing={isResizing || undefined}
        data-testid="summary-panel"
      >
        {children}
      </Box>
    </ResizableBox>
  );
}
