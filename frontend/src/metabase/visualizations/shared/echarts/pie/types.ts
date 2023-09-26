import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieChartColumns {
  metric: ColumnDescriptor;
  dimension: ColumnDescriptor;
}

export interface PieLegendItem {
  title: string[];
  color: string;
}
