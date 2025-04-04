import type { TableState } from "@tanstack/table-core";
import { useEffect, useRef } from "react";

export const useColumnResizeObserver = (
  state: TableState,
  onChange: (columnId: string, columnSize: number) => void,
) => {
  const columnResizeRef = useRef<string | false>();
  useEffect(() => {
    if (
      state.columnSizingInfo &&
      !state.columnSizingInfo?.isResizingColumn &&
      columnResizeRef.current
    ) {
      onChange(
        columnResizeRef.current,
        state.columnSizing[columnResizeRef.current],
      );
    }
    columnResizeRef.current = state.columnSizingInfo?.isResizingColumn;
  }, [onChange, state.columnSizingInfo, state.columnSizing]);
};
