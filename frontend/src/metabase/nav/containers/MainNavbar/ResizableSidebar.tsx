import { useLocalStorage } from "@mantine/hooks";
import cx from "classnames";
import {
  type ComponentProps,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { Resizable } from "react-resizable";

import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import S from "./ResizableSidebar.module.css";
import { Sidebar } from "./Sidebar";

const DEFAULT_WIDTH = parseInt(NAV_SIDEBAR_WIDTH, 10);
const MIN_WIDTH = 232;
const MAX_WIDTH = 420;

type ResizablePanelProps = {
  /** Where the chosen width is remembered. */
  storageKey: string;
  side: "left" | "right";
  /**
   * Renders the panel at `width`. It must be positioned (the resize handle
   * sits on its inner edge) and draw that edge as a border.
   */
  children: (width: number) => ReactElement;
};

/**
 * PROTOTYPE: makes a side panel resizable by dragging its inner edge, from
 * 232px to 420px (starting at the main nav's usual 324px). The chosen width is
 * kept across reloads. The edge's border darkens while hovered or dragged, and
 * text can't be selected mid-drag.
 */
export function ResizablePanel({
  storageKey,
  side,
  children,
}: ResizablePanelProps) {
  const [storedWidth, setStoredWidth] = useLocalStorage({
    key: storageKey,
    defaultValue: DEFAULT_WIDTH,
    getInitialValueInEffect: false,
  });
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const isLeft = side === "left";
  const isResizing = dragWidth != null;

  // Dragging across the page would otherwise select text along the way.
  useEffect(() => {
    if (!isResizing) {
      return;
    }
    window.getSelection()?.removeAllRanges();
    document.body.classList.add(S.resizing);
    return () => document.body.classList.remove(S.resizing);
  }, [isResizing]);

  return (
    <Resizable
      // Merged into the child's own class; extra props pass through to it.
      className={S.resizableSidebar}
      data-side={side}
      data-resizing={isResizing || undefined}
      axis="x"
      width={width}
      height={0}
      minConstraints={[MIN_WIDTH, 0]}
      maxConstraints={[MAX_WIDTH, 0]}
      // The inner edge: right for a left panel, left for a right one.
      resizeHandles={[isLeft ? "e" : "w"]}
      handle={
        <div
          className={cx(S.resizeHandle, isLeft ? S.handleEnd : S.handleStart)}
        />
      }
      onResizeStart={() => setDragWidth(width)}
      onResize={(_event, { size }) => setDragWidth(size.width)}
      onResizeStop={(_event, { size }) => {
        setStoredWidth(size.width);
        setDragWidth(null);
      }}
    >
      {children(width)}
    </Resizable>
  );
}

type ResizableSidebarProps = Omit<ComponentProps<typeof Sidebar>, "width"> & {
  /** Where the chosen width is remembered. */
  storageKey: string;
};

/** PROTOTYPE: a `Sidebar` that's a `ResizablePanel`. */
export function ResizableSidebar({
  storageKey,
  side,
  ...sidebarProps
}: ResizableSidebarProps) {
  return (
    <ResizablePanel storageKey={storageKey} side={side}>
      {(width) => (
        <Sidebar {...sidebarProps} side={side} width={`${width}px`} />
      )}
    </ResizablePanel>
  );
}
