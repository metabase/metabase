import cx from "classnames";
import {
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
  forwardRef,
} from "react";
import { ResizableBox, type ResizeCallbackData } from "react-resizable";

import S from "./ResizableSidePanel.module.css";
import {
  DEFAULT_SIDE_PANEL_SIZE,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SIDE_PANEL_SIZES,
  type SidePanelSize,
} from "./constants";
import { useSidePanelWidth } from "./useSidePanelWidth";

type HandleAxis = "e" | "w";

type SidePanelResizeHandleProps = HTMLAttributes<HTMLDivElement> & {
  handleAxis?: HandleAxis;
};

const SidePanelResizeHandle = forwardRef(function SidePanelResizeHandle(
  { handleAxis, className, ...rest }: SidePanelResizeHandleProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      className={cx(
        S.handle,
        handleAxis === "w" ? S.handleWest : S.handleEast,
        className,
      )}
      data-testid="side-panel-resize-handle"
      {...rest}
    />
  );
});

type BaseResizableSidePanelProps = {
  /**
   * Which side of the layout the panel is anchored to. The resize handle sits
   * on the panel's inner edge: a left panel resizes from its right edge, a
   * right panel from its left edge.
   */
  side?: "left" | "right";
  /** Preset width the panel starts at when `width` is not controlled. */
  defaultSize?: SidePanelSize;
  /**
   * Preset the panel may be dragged up to. Defaults to the standard 384px
   * ceiling; panels that were already wider (e.g. `defaultSize="lg"`) should
   * pass `maxSize="xl"` (480px) so they can still reach their original width.
   */
  maxSize?: SidePanelSize;
  minWidth?: number;
  onResizeStart?: () => void;
  onResizeStop?: (width: number) => void;
  className?: string;
  children?: ReactNode;
};

type UncontrolledWidthProps = {
  /**
   * Unique, stable id under which the user's resized width is remembered in
   * localStorage. Widths equal to `defaultSize` are not stored.
   */
  storageKey: string;
  width?: undefined;
  onResize?: (width: number) => void;
};

type ControlledWidthProps = {
  /** The parent owns the width and its persistence (see `useSidePanelWidth`). */
  storageKey?: undefined;
  width: number;
  onResize: (width: number) => void;
};

export type ResizableSidePanelProps = BaseResizableSidePanelProps &
  (UncontrolledWidthProps | ControlledWidthProps);

export function ResizableSidePanel({
  side = "left",
  defaultSize = DEFAULT_SIDE_PANEL_SIZE,
  maxSize,
  minWidth = SIDE_PANEL_MIN_WIDTH,
  storageKey,
  width: controlledWidth,
  onResize,
  onResizeStart,
  onResizeStop,
  className,
  children,
}: ResizableSidePanelProps) {
  const maxWidth = maxSize ? SIDE_PANEL_SIZES[maxSize] : SIDE_PANEL_MAX_WIDTH;
  const {
    width: uncontrolledWidth,
    setWidth: setUncontrolledWidth,
    persistWidth,
  } = useSidePanelWidth({
    storageKey,
    defaultWidth: SIDE_PANEL_SIZES[defaultSize],
    minWidth,
    maxWidth,
  });
  const width = controlledWidth ?? uncontrolledWidth;
  const handleAxis: HandleAxis = side === "right" ? "w" : "e";

  const handleResize = (_event: SyntheticEvent, data: ResizeCallbackData) => {
    setUncontrolledWidth(data.size.width);
    onResize?.(data.size.width);
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
    onResizeStop?.(data.size.width);
  };

  return (
    <ResizableBox
      className={cx(S.panel, className)}
      data-testid="resizable-side-panel"
      width={width}
      minConstraints={[minWidth, 0]}
      maxConstraints={[maxWidth, 0]}
      axis="x"
      resizeHandles={[handleAxis]}
      handle={<SidePanelResizeHandle handleAxis={handleAxis} />}
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
    >
      {children}
    </ResizableBox>
  );
}
