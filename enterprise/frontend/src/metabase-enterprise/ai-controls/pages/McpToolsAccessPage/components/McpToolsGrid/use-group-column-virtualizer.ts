import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual";
import { type RefObject, useRef } from "react";

import {
  COLUMN_OVERSCAN,
  GROUP_COLUMN_WIDTH_PX,
  TOOL_COLUMN_WIDTH_PX,
} from "./constants";

export type GroupColumnVirtualizer = {
  scrollRef: RefObject<HTMLDivElement>;
  virtualColumns: VirtualItem[];
  leadingSpacerWidth: number;
  trailingSpacerWidth: number;
  tableMinWidth: number;
};

export function useGroupColumnVirtualizer(
  columnCount: number,
): GroupColumnVirtualizer {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: columnCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GROUP_COLUMN_WIDTH_PX,
    overscan: COLUMN_OVERSCAN,
    scrollMargin: TOOL_COLUMN_WIDTH_PX,
  });

  const virtualColumns = virtualizer.getVirtualItems();
  const first = virtualColumns.at(0);
  const last = virtualColumns.at(-1);
  // Item offsets include scrollMargin; getTotalSize() excludes it.
  const totalSize = virtualizer.getTotalSize();
  const leadingSpacerWidth = first ? first.start - TOOL_COLUMN_WIDTH_PX : 0;
  const trailingSpacerWidth = last
    ? totalSize - (last.end - TOOL_COLUMN_WIDTH_PX)
    : 0;

  return {
    scrollRef,
    virtualColumns,
    leadingSpacerWidth,
    trailingSpacerWidth,
    tableMinWidth: TOOL_COLUMN_WIDTH_PX + totalSize,
  };
}
