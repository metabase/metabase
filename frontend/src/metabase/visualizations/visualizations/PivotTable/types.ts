import type { ClickObjectDataRow, ClickObjectDimension } from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";

type PivotTableClickDimension = Omit<ClickObjectDimension, "column"> & {
  colIdx: number;
};

type PivotTableClickDataRow = Omit<ClickObjectDataRow, "col"> & {
  colIdx: number;
};

export type PivotTableClicked =
  | {
      value: RowValue;
      colIdx: number;
      data?: never;
      dimensions?: never;
    }
  | {
      value?: RowValue;
      colIdx?: never;
      data?: PivotTableClickDataRow[];
      dimensions?: PivotTableClickDimension[];
    };

export interface HeaderItem {
  clicked: PivotTableClicked | null;

  isCollapsed?: boolean;
  hasChildren: boolean;
  hasSubtotal?: boolean;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;

  depth: number;
  maxDepthBelow: number;
  offset: number;
  span: number; // rows to span

  path: RowValue[] | null;
  rawValue: RowValue;
  value: string;
}

export type BodyItem = HeaderItem & {
  backgroundColor?: string;
};

export type PivotTableData = {
  leftHeaderItems: HeaderItem[];
  topHeaderItems: HeaderItem[];
  rowCount: number;
  columnCount: number;
  rowIndex: RowValue[][];
  getRowSection: (columnIndex: number, rowIndex: number) => BodyItem[];
  rowIndexes: number[];
  columnIndexes: number[];
  valueIndexes: number[];
  columnsWithoutPivotGroup: DatasetColumn[];
};

export type CustomColumnWidth = Record<number, number>;

export type HeaderWidthType = {
  leftHeaderWidths: number[] | null;
  totalLeftHeaderWidths: number | null;
  valueHeaderWidths: CustomColumnWidth;
};
