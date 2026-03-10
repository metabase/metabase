import type { Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import type React from "react";

import {
  HEADER_BORDER_SIZE,
  HEADER_HEIGHT,
  PINNED_ROW_Z_INDEX,
} from "../constants";
import type { DataGridColumn } from "../types";

export const getRowPositionStyles = <TData>(
  row: Row<TData>,
  virtualRow: VirtualItem | undefined,
  stickyElementsBackgroundColor: string,
): React.CSSProperties => {
  if (!virtualRow) {
    return {};
  }
  const pinnedPosition = row.getIsPinned();
  if (pinnedPosition === "top") {
    return {
      position: "sticky",
      top: `${HEADER_HEIGHT + virtualRow.start + HEADER_BORDER_SIZE}px`,
      zIndex: PINNED_ROW_Z_INDEX,
      backgroundColor: stickyElementsBackgroundColor,
    };
  }
  return {
    position: "absolute",
    minHeight: `${virtualRow.size}px`,
    transform: `translateY(${virtualRow.start}px)`,
  };
};

export const getColumnPositionStyles = <TData>(
  column: DataGridColumn<TData>,
): React.CSSProperties => {
  if (column.virtualItem) {
    return {
      position: "absolute",
      left: column.virtualItem.start,
      width: column.origin.getSize(),
      top: 0,
      bottom: 0,
    };
  }
  return {
    width: column.origin.getSize(),
  };
};
