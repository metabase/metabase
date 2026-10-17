import cx from "classnames";
import { type ReactNode, type Ref, forwardRef, useRef, useState } from "react";
import { Resizable, type ResizeHandle } from "react-resizable";

import S from "./TableFlow.module.css";

// Defaults match the panel sizes before they became resizable.
const DEFAULT_CHART_HEIGHT = 400;
const DEFAULT_SIDE_PANEL_WIDTH = 400;

/** Releasing the chart shorter than this collapses it to a bar. */
const CHART_COLLAPSE_HEIGHT = 120;
const COLLAPSED_CHART_HEIGHT = 44;
/** Releasing the chart within this distance of its maximum collapses the table to its header. */
const TABLE_COLLAPSE_HEIGHT = 120;
/** Releasing a side panel narrower than this closes it. */
const SIDE_PANEL_COLLAPSE_WIDTH = 240;

type PanelResizeHandleProps = {
  handleAxis?: ResizeHandle;
};

/** A drag handle that sits in the gap beside a panel and shows a grip on hover. */
const PanelResizeHandle = forwardRef(function PanelResizeHandle(
  { handleAxis, ...rest }: PanelResizeHandleProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={S.resizeHandle}
      data-axis={handleAxis}
      data-testid={`panel-resize-handle-${handleAxis}`}
      {...rest}
    >
      <span className={S.resizeGrip} />
    </div>
  );
});

type ResizableChartPanelProps = {
  /** The tallest the chart may get while the table below keeps its header. */
  maxHeight: number;
  className?: string;
  children: ReactNode;
  /** Shown instead of the chart while collapsed; `expand` restores the chart. */
  renderCollapsed: (expand: () => void) => ReactNode;
};

/**
 * The chart card, resizable from its bottom edge. Dragging it nearly shut collapses it
 * to a bar, and dragging it nearly to the bottom leaves the table below as just its header.
 */
export function ResizableChartPanel({
  maxHeight,
  className,
  children,
  renderCollapsed,
}: ResizableChartPanelProps) {
  const [height, setHeight] = useState(DEFAULT_CHART_HEIGHT);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const heightBeforeResizeRef = useRef(height);
  const renderedHeight = isCollapsed
    ? COLLAPSED_CHART_HEIGHT
    : Math.min(height, maxHeight);

  return (
    <Resizable
      axis="y"
      height={renderedHeight}
      resizeHandles={["s"]}
      minConstraints={[0, 0]}
      maxConstraints={[Infinity, maxHeight]}
      handle={(axis, ref) => <PanelResizeHandle ref={ref} handleAxis={axis} />}
      onResizeStart={() => {
        heightBeforeResizeRef.current = isCollapsed
          ? DEFAULT_CHART_HEIGHT
          : renderedHeight;
      }}
      onResize={(_event, { size }) => {
        setIsCollapsed(false);
        setHeight(size.height);
      }}
      onResizeStop={(_event, { size }) => {
        if (size.height < CHART_COLLAPSE_HEIGHT) {
          setIsCollapsed(true);
          setHeight(heightBeforeResizeRef.current);
        } else if (maxHeight - size.height < TABLE_COLLAPSE_HEIGHT) {
          setHeight(maxHeight);
        }
      }}
    >
      <div
        className={cx(className, { [S.chartPanelCollapsed]: isCollapsed })}
        style={{ height: renderedHeight }}
        data-testid="chart-panel"
      >
        {isCollapsed ? renderCollapsed(() => setIsCollapsed(false)) : children}
      </div>
    </Resizable>
  );
}

type ResizableSidePanelProps = {
  side: "left" | "right";
  maxWidth: number;
  className?: string;
  /** Called when the panel is dragged nearly shut. */
  onCollapse: () => void;
  children: ReactNode;
};

/** A side panel resizable from its inner edge; dragging it nearly shut closes it. */
export function ResizableSidePanel({
  side,
  maxWidth,
  className,
  onCollapse,
  children,
}: ResizableSidePanelProps) {
  const [width, setWidth] = useState(DEFAULT_SIDE_PANEL_WIDTH);
  const widthBeforeResizeRef = useRef(width);
  const renderedWidth = Math.min(width, maxWidth);

  return (
    <Resizable
      axis="x"
      width={renderedWidth}
      resizeHandles={[side === "left" ? "e" : "w"]}
      minConstraints={[0, 0]}
      maxConstraints={[maxWidth, Infinity]}
      handle={(axis, ref) => <PanelResizeHandle ref={ref} handleAxis={axis} />}
      onResizeStart={() => {
        widthBeforeResizeRef.current = renderedWidth;
      }}
      onResize={(_event, { size }) => setWidth(size.width)}
      onResizeStop={(_event, { size }) => {
        if (size.width < SIDE_PANEL_COLLAPSE_WIDTH) {
          setWidth(widthBeforeResizeRef.current);
          onCollapse();
        }
      }}
    >
      <aside className={className} style={{ width: renderedWidth }}>
        {children}
      </aside>
    </Resizable>
  );
}
