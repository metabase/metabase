import cx from "classnames";
import type { ReactNode } from "react";

import {
  ResizableSidePanel,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  SIDE_PANEL_SIZES,
  useSidePanelWidth,
} from "metabase/common/components/ResizableSidePanel";
import { Box } from "metabase/ui";

import ViewSidebarS from "./ViewSidebar.module.css";

interface ViewSidebarProps {
  side: "left" | "right";
  /** Where the user's resized width for this sidebar is remembered. */
  storageKey: string;
  width?: number;
  isOpen?: boolean;
  children?: ReactNode;
}

export const ViewSidebar = ({
  side = "right",
  storageKey,
  width = 400,
  isOpen,
  children,
}: ViewSidebarProps) => {
  // Sidebars wider than the standard max keep room to grow to their old width.
  const maxSize = width > SIDE_PANEL_MAX_WIDTH ? "xl" : undefined;
  const {
    width: resizedWidth,
    setWidth: setResizedWidth,
    persistWidth,
  } = useSidePanelWidth({
    storageKey,
    defaultWidth: width,
    minWidth: SIDE_PANEL_MIN_WIDTH,
    maxWidth: maxSize ? SIDE_PANEL_SIZES[maxSize] : SIDE_PANEL_MAX_WIDTH,
  });

  // Sidebars like Question Info/Settings render as overlays and drive this
  // frame to width 0; they are not resizable, so only mount the resize handle
  // (and use the remembered width) for open panels that occupy real width.
  const isResizable = Boolean(isOpen) && width > 0;
  const openWidth = isResizable ? resizedWidth : width;

  return (
    // If we passed `width` as prop, it would end up in the final HTML elements.
    // This would ruin the collapse animation, so the outer `aside` stays
    // responsible for animating its width between 0 (closed) and the open
    // width, and we never forward `width` to it directly.
    <Box
      className={cx(ViewSidebarS.ViewSidebarAside, {
        [ViewSidebarS.rightSide]: side === "right",
        [ViewSidebarS.leftSide]: side === "left",
        [ViewSidebarS.isOpen]: isOpen,
      })}
      component="aside"
      data-testid={`sidebar-${side}`}
      w={isOpen ? openWidth : undefined}
      left={side === "left" ? 0 : undefined}
      right={side === "right" ? 0 : undefined}
    >
      {isResizable ? (
        <ResizableSidePanel
          side={side}
          width={resizedWidth}
          onResize={setResizedWidth}
          onResizeStop={persistWidth}
          maxSize={maxSize}
        >
          <Box w="100%" h="100%">
            {children}
          </Box>
        </ResizableSidePanel>
      ) : (
        // Held at full width and taken out of flow so content doesn't reflow
        // while the outer `aside` collapses to 0.
        <Box w={width} pos="absolute" h="100%">
          {children}
        </Box>
      )}
    </Box>
  );
};
