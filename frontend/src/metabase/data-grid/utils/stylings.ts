import type { Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import type React from "react";

import {
  HEADER_BORDER_SIZE,
  HEADER_HEIGHT,
  PINNED_ROW_Z_INDEX,
} from "../constants";
import type { DataGridColumn } from "../types";

const getActiveBackground = (base: string): string =>
  `color-mix(in srgb, var(--mb-color-brand) 10%, ${base})`;

export const getRowPositionStyles = <TData>(
  row: Row<TData>,
  virtualRow: VirtualItem | undefined,
  stickyElementsBackgroundColor: string,
  active: boolean,
): React.CSSProperties => {
  const pinnedPosition = row.getIsPinned();

  const baseBackgroundColor = pinnedPosition
    ? stickyElementsBackgroundColor
    : "transparent";

  const backgroundColor = active
    ? getActiveBackground(baseBackgroundColor)
    : baseBackgroundColor;

  if (!virtualRow) {
    return {
      backgroundColor,
    };
  }

  if (pinnedPosition === "top") {
    return {
      position: "sticky",
      top: `${HEADER_HEIGHT + virtualRow.start + HEADER_BORDER_SIZE}px`,
      minHeight: `${virtualRow.size}px`,
      zIndex: PINNED_ROW_Z_INDEX,
      backgroundColor,
    };
  }
  return {
    position: "absolute",
    top: 0,
    left: 0,
    minHeight: `${virtualRow.size}px`,
    transform: `translateY(${virtualRow.start}px)`,
    backgroundColor,
  };
};

export const getColumnPositionStyles = <TData>(
  column: DataGridColumn<TData>,
): React.CSSProperties => {
  return {
    width: column.origin.getSize(),
  };
};
