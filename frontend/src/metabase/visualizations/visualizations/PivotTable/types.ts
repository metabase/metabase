import type {
  DatasetColumn,
  FieldReference,
  AggregateFieldReference,
} from "metabase-types/api";

export type PivotSetting = {
  columns: FieldReference[];
  rows: FieldReference[];
  values: AggregateFieldReference[];
};

export type PivotTableClicked = { value: string; column: DatasetColumn };
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
