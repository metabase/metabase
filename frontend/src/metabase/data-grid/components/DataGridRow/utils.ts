import type { Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";

import {
  HEADER_BORDER_SIZE,
  HEADER_HEIGHT,
  PINNED_ROW_Z_INDEX,
} from "../../constants";

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
