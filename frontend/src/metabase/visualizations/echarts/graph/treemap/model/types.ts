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

export type TreemapTree = TreemapNode[];

export interface TreemapBuildResult {
  tree: TreemapTree;
  error?: { message: string };
}

export interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreemapLayoutNode {
  id: string /* encodes path: ("0", "0-1") */;
  rect: { width: number; height: number };
  isLeaf: boolean;
}
