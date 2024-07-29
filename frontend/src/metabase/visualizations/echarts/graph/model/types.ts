import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import type { RowValue } from "metabase-types/api";

export interface SankeyChartColumns {
  source: ColumnDescriptor;
  target: ColumnDescriptor;
  value: ColumnDescriptor;
}

export interface SankeyRawData {
  links: SankeyLink[];
  levels: RowValue[][];
}

export interface SankeyLink {
  source: RowValue;
  target: RowValue;
  value: RowValue;
}

export type Formatter = (value: RowValue) => string;

export interface SankeyFormatters {
  source: Formatter;
  target: Formatter;
  value: Formatter;
}

export interface SankeyChartModel {
  data: SankeyRawData;
  formatters: SankeyFormatters;
}
