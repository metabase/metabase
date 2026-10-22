import { type ReactNode, type SyntheticEvent, useState } from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import { ResizeHandle } from "metabase/common/components/ResizeHandle";
import { Box } from "metabase/ui";

import S from "./ResizableSummaryPanel.module.css";

const MIN_PANEL_WIDTH = 320;
const MIN_RESULTS_WIDTH = 320;

type ResizableSummaryPanelProps = {
  /** Width of the area the panel shares with the results. */
  containerWidth: number;
  children: ReactNode;
};

/**
 * The right-hand panel the sidebar variants render in, resizable from its left edge. It starts at
 * a third of the window, like the query builder's summarize sidebar, and always leaves the results
 * some room.
 */
export function ResizableSummaryPanel({
  containerWidth,
  children,
}: ResizableSummaryPanelProps) {
  const [width, setWidth] = useState(() => Math.round(window.innerWidth / 3));
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
      width={Math.min(width, maxWidth)}
      minConstraints={[MIN_PANEL_WIDTH, 0]}
      maxConstraints={[maxWidth, 0]}
      axis="x"
      resizeHandles={["w"]}
      handle={<ResizeHandle handleAxis="w" />}
      onResizeStart={() => document.body.classList.add(S.isResizing)}
      onResize={handleResize}
      onResizeStop={() => document.body.classList.remove(S.isResizing)}
    >
      <Box className={S.content} data-testid="summary-panel">
        {children}
      </Box>
    </ResizableBox>
  );
}
