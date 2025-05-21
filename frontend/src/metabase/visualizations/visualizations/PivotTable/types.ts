import type { ClickObjectDataRow, ClickObjectDimension } from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

type PivotTableClickDimension = ClickObjectDimension & {
  colIdx?: number;
};

type PivotTableClickDataRow = ClickObjectDataRow & {
  colIdx?: number;
};

export type PivotTableClicked = {
  value: string;
  colIdx?: number;
  column?: DatasetColumn;
  data?: PivotTableClickDataRow[];
  dimensions?: PivotTableClickDimension[];
};

export interface HeaderItem {
  clicked: PivotTableClicked;

  isCollapsed?: boolean;
  hasChildren: boolean;
  hasSubtotal?: boolean;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;

  depth: number;
  maxDepthBelow: number;
  offset: number;
  span: number; // rows to span

  path: string[];
  rawValue: string;
  value: string;
}

export type BodyItem = HeaderItem & {
  backgroundColor?: string;
};

export type CustomColumnWidth = Record<number, number>;

export type HeaderWidthType = {
  leftHeaderWidths: number[] | null;
  totalLeftHeaderWidths: number | null;
  valueHeaderWidths: CustomColumnWidth;
};
