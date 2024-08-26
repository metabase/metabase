import type { PieArcDatum } from "d3";

import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";

export interface PieColumnDescriptors {
  metricDesc: ColumnDescriptor;
  dimensionDesc: ColumnDescriptor;
}

export interface PieSliceData {
  key: string | number; // dimension value
  value: number; // size of the slice used for rendering
  displayValue: number; // real metric value of the slice displayed in tooltip or total graphic
  normalizedPercentage: number;
  color: string;
  isOther: boolean;
  noHover: boolean;
  includeInLegend: boolean;
  rowIndex?: number;
}

export type PieSlice = PieArcDatum<PieSliceData>;

export interface PieChartModel {
  slices: PieSlice[];
  otherSlices: PieSlice[];
  total: number;
  colDescs: PieColumnDescriptors;
}
