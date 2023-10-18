import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieColumnDescriptors {
  metricDesc: ColumnDescriptor;
  dimensionDesc: ColumnDescriptor;
}

export interface PieLegendItem {
  title: string[];
  color: string;
}

export interface PieSlice {
  key: string | number | boolean;
  value: number;
  normalizedPercentage: number;
  rowIndex?: number;
  color: string;
}

export interface PieChartModel {
  slices: PieSlice[];
  total: number;
}
