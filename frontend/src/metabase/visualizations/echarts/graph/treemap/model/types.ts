import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import type { RowValue } from "metabase-types/api";

export type NodeId = string;

export interface TreemapChartColumns {
  grouping: ColumnDescriptor;
  subGrouping?: ColumnDescriptor;
  value: ColumnDescriptor;
}

export interface TreemapNode {
  rawName: RowValue;
  displayName: string;
  value: number;
  rowIndices: number[];
  children?: TreemapNode[];
}

export interface TreemapSeriesNode {
  id: string;
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
  itemStyle?: { color?: string; borderColor?: string };
  label?: {
    show?: boolean;
    width?: number;
    overflow?: "truncate" | "break";
    formatter?: string;
  };
  upperLabel?: {
    backgroundColor?: string;
    color?: string;
    formatter?: string;
    rich?: Record<string, Record<string, unknown>>;
  };
  children?: TreemapSeriesNode[];
}

export type TreemapTree = TreemapNode[];

export interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartPointer {
  x: number;
  y: number;
}

export interface TreemapLayoutNode {
  id: string /* encodes path: ("0", "0-1") */;
  rect: { width: number; height: number };
  isLeaf: boolean;
}
