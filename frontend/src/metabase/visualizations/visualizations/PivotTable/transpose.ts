import type { DatasetColumn } from "metabase-types/api";

import type { BodyItem, HeaderItem } from "./types";

export interface PivotData {
  leftHeaderItems: HeaderItem[];
  topHeaderItems: HeaderItem[];
  rowCount: number;
  columnCount: number;
  rowIndex: string[];
  getRowSection: (columnIndex: number, rowIndex: number) => BodyItem[];
  rowIndexes: number[];
  columnIndexes: number[];
  valueIndexes: number[];
  columnsWithoutPivotGroup: DatasetColumn[];
}

export function transposePivot(result: PivotData): PivotData {
  const cols = result.columnsWithoutPivotGroup;
  const numMeasures = result.valueIndexes.length;

  const leftHeaderItems: HeaderItem[] = result.valueIndexes.map(
    (valIdx: number, i: number) => ({
      value: cols[valIdx].display_name || cols[valIdx].name,
      rawValue: cols[valIdx].name,
      depth: 0,
      offset: i,
      span: 1,
      maxDepthBelow: 1,
      hasChildren: false,
      hasSubtotal: false,
      isSubtotal: false,
      isGrandTotal: false,
      path: [cols[valIdx].name],
      clicked: { value: cols[valIdx].display_name, column: cols[valIdx] },
    }),
  );

  const topHeaderItems: HeaderItem[] = result.leftHeaderItems.map(
    (item: HeaderItem) => ({
      ...item,
      depth: 0,
      maxDepthBelow: 0,
    }),
  );

  const origFn = result.getRowSection;
  const getRowSection = (colIdx: number, rowIdx: number): BodyItem[] => {
    if (colIdx >= result.rowCount || rowIdx >= numMeasures) {
      return [];
    }
    const row = origFn(0, colIdx);
    if (!row) {
      return [];
    }
    return [row[rowIdx]];
  };

  return {
    leftHeaderItems,
    topHeaderItems,
    rowCount: numMeasures,
    columnCount: result.rowCount,
    rowIndex: Array.from({ length: numMeasures }, (_, i) => String(i)),
    getRowSection,
    rowIndexes: [0],
    columnIndexes: result.rowIndexes,
    valueIndexes: [0],
    columnsWithoutPivotGroup: cols,
  };
}
