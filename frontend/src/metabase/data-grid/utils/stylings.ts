import type React from "react";

import {
  HEADER_BORDER_SIZE,
  HEADER_HEIGHT,
  PINNED_ROW_Z_INDEX,
} from "../constants";
import type { DataGridColumnType, DataGridRowType } from "../types";

const getActiveBackground = (base: string): string =>
  `color-mix(in srgb, var(--mb-color-brand) 10%, ${base})`;

export const getRowPositionStyles = <TData>(
  row: DataGridRowType<TData>,
  stickyElementsBackgroundColor: string,
  active: boolean,
): React.CSSProperties => {
  const pinnedPosition = row.origin.getIsPinned();

  const baseBackgroundColor = pinnedPosition
    ? stickyElementsBackgroundColor
    : "transparent";

  const backgroundColor = active
    ? getActiveBackground(baseBackgroundColor)
    : baseBackgroundColor;

  if (!row.virtualItem) {
    return { backgroundColor };
  }

  if (pinnedPosition === "top") {
    return {
      position: "sticky",
      top: `${HEADER_HEIGHT + row.virtualItem.start + HEADER_BORDER_SIZE}px`,
      minHeight: `${row.virtualItem.size}px`,
      zIndex: PINNED_ROW_Z_INDEX,
      backgroundColor,
    };
  }
  return {
    position: "absolute",
    top: 0,
    left: 0,
    minHeight: `${row.virtualItem.size}px`,
    transform: `translateY(${row.virtualItem.start}px)`,
    backgroundColor,
  };
};

export const getColumnPositionStyles = <TData>(
  column: DataGridColumnType<TData>,
): React.CSSProperties => {
  return { width: column.origin.getSize() };
};
