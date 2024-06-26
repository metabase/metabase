import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieColumnDescriptors {
  metricDesc: ColumnDescriptor;
  dimensionDesc: ColumnDescriptor;
}

export interface PieSliceData {
  key: string | number; // dimension value
  value: number; // size of the slice used for rendering
  tooltipDisplayValue: number; // real metric value of the slice displayed in tooltip
  normalizedPercentage: number;
  rowIndex?: number;
  color: string;
}

export type PieSlice = d3.layout.pie.Arc<PieSliceData>;

export interface PieChartModel {
  slices: PieSlice[];
  total: number;
  colDescs: PieColumnDescriptors;
}
