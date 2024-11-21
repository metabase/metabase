import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import type { RowValue } from "metabase-types/api";

export type ColumnKey = string;

export interface SankeyChartColumns {
  source: ColumnDescriptor;
  target: ColumnDescriptor;
  value: ColumnDescriptor;
}

export interface SankeyNode {
  value: RowValue;
  level: number;
  hasInputs: boolean;
  hasOutputs: boolean;
  inputColumnValues: Record<ColumnKey, RowValue>;
  outputColumnValues: Record<ColumnKey, RowValue>;
}

export interface SankeyData {
  links: SankeyLink[];
  nodes: SankeyNode[];
}

export interface SankeyLink {
  source: RowValue;
  target: RowValue;
  value: RowValue;
  columnValues: Record<ColumnKey, RowValue>;
}

export interface SankeyDataModel {
  data: SankeyData;
}

export type Formatter = (value: RowValue) => string;

export interface SankeyFormatters {
  node: Formatter;
  value: Formatter;
  valueCompact: Formatter;
}

export interface SankeyChartModel {
  data: SankeyData;
  formatters: SankeyFormatters;
  sankeyColumns: SankeyChartColumns;
  nodeColors: Record<string, string>;
}
