import type React from "react";

import type { DataGridColumnType, DataGridRowType } from "../types";

export const getRowPositionStyles = <TData>(
  row: DataGridRowType<TData>,
): React.CSSProperties => {
  if (!row.virtualItem) {
    return {};
  }
  return {
    position: "absolute",
    top: 0,
    left: 0,
    minHeight: `${row.virtualItem.size}px`,
    transform: `translateY(${row.virtualItem.start}px)`,
  };
};

export const getColumnPositionStyles = <TData>(
  column: DataGridColumnType<TData>,
): React.CSSProperties => {
  return { width: column.origin.getSize() };
};
