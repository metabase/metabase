import type { CSSProperties } from "react";

export function getColumnStyle(
  columnWidths: Record<string, number>,
  columnId: string,
  isFirstColumn: boolean,
): CSSProperties {
  const measuredWidth = columnWidths[columnId];
  const hasMeasuredWidth = measuredWidth != null && measuredWidth > 0;

  if (hasMeasuredWidth) {
    return { width: measuredWidth, flex: "none" };
  }

  return isFirstColumn ? { flex: 1, minWidth: 0 } : { flex: "none" };
}
