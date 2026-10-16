import type { RowValue } from "metabase-types/api";

import type { ColumnDescriptor } from "../../../../lib/graph/columns";

export type ColumnKey = string;

export interface SankeyChartColumns {
  source: ColumnDescriptor;
  target: ColumnDescriptor;
  value: ColumnDescriptor;
}

export interface SankeyNode {
  rawName: RowValue;
  displayName: RowValue;
  level: number;
  hasInputs: boolean;
  hasOutputs: boolean;
  inputColumnValues: Record<ColumnKey, RowValue>;
  outputColumnValues: Record<ColumnKey, RowValue>;
  outputLinkByTarget: Map<RowValue, SankeyLink>;
}

export interface SankeyData {
  links: SankeyLink[];
  nodes: SankeyNode[];
}

export interface SankeyLink {
  sourceNode: SankeyNode;
  targetNode: SankeyNode;
  source: RowValue;
  target: RowValue;
  value: RowValue;
  columnValues: Record<ColumnKey, RowValue>;
  /** Set when links are split by `sankey.breakout`. */
  breakoutValue?: RowValue;
  /** The breakout value's color, overriding the edge color. */
  color?: string;
  /** The formatted breakout value. */
  label?: string;
}

export interface SankeyDataModel {
  data: SankeyData;
}

export type Formatter = (value: RowValue) => string;

export interface SankeyFormatters {
  value: Formatter;
  valueCompact: Formatter;
  source: Formatter;
  target: Formatter;
  node: (node: SankeyNode) => string;
  /** The text shown for a node, which can differ from its key. */
  nodeLabel: (node: SankeyNode) => string;
}

export interface SankeyChartModel {
  data: SankeyData;
  formatters: SankeyFormatters;
  sankeyColumns: SankeyChartColumns;
  nodeColors: Record<string, string>;
  /** Draw the nodes in `data.nodes` order, rather than reordering them to reduce crossings. */
  keepsNodeOrder?: boolean;
}
