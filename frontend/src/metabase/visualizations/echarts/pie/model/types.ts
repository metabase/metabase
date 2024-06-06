import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieColumnDescriptors {
  metricDesc: ColumnDescriptor;
  dimensionDesc: ColumnDescriptor;
}

export interface PieSlice {
  key: string | number | boolean; // dimension value
  value: number; // size of the slice used for rendering
  tooltipDisplayValue: number; // real metric value of the slice displayed in tooltip
  normalizedPercentage: number;
  rowIndex?: number;
  color: string;
}

export interface PieChartModel {
  slices: PieSlice[];
  total: number;
  colDescs: PieColumnDescriptors;
}
