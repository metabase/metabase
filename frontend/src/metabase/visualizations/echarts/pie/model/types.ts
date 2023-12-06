import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieColumnDescriptors {
  metricDesc: ColumnDescriptor;
  dimensionDesc: ColumnDescriptor;
}

export interface PieSlice {
  key: string;
  value: number;
  normalizedPercentage: number;
  rowIndex?: number;
  color: string;
}

export interface PieChartModel {
  slices: PieSlice[];
  total: number;
}
