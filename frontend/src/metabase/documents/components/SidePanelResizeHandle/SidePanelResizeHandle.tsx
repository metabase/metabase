import type { PointerEvent } from "react";

import { Box } from "metabase/ui";

import type { ResizeHandle } from "../../hooks/use-side-panel-widths";

import S from "./SidePanelResizeHandle.module.css";

type SidePanelResizeHandleProps = {
  handle: ResizeHandle;
  isActive: boolean;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
};

/**
 * A drag handle on a floating side panel: on its outer edge, which needs a
 * relatively positioned parent, or as the divider between two panes.
 */
export const SidePanelResizeHandle = ({
  handle,
  isActive,
  onPointerDown,
}: SidePanelResizeHandleProps) => (
  <Box
    className={handle === "outer" ? S.outerHandle : S.divider}
    data-active={isActive || undefined}
    aria-hidden
    onPointerDown={onPointerDown}
  />
);
