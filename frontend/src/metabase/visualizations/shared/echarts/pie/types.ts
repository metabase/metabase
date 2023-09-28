import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieChartColumns {
  metric: ColumnDescriptor;
  dimension: ColumnDescriptor;
}

export interface PieLegendItem {
  title: string[];
  color: string;
}

export interface PieSlice {
  key: string | number;
  value: number;
  percentage: number;
  rowIndex?: number;
  color: string;
}
