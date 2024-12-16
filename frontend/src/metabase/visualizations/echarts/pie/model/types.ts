import type { ColumnDescriptor } from "metabase/visualizations/lib/graph/columns";
import type { RemappingHydratedDatasetColumn } from "metabase/visualizations/types";

export interface PieRow {
  key: string;
  name: string;
  originalName: string;
  color: string;
  defaultColor: boolean;
  enabled: boolean;
  hidden: boolean;
  isOther: boolean;
}

export interface PieColumnDescriptors {
  metricDesc: ColumnDescriptor;
  dimensionDesc: ColumnDescriptor;
  middleDimensionDesc?: ColumnDescriptor;
  outerDimensionDesc?: ColumnDescriptor;
}

export type SliceTreeNode = {
  key: string;
  // Display name, already formatted
  name: string;
  // The rendered size of this slice. Due to ECharts limitations with negative values:
  // - When all values are negative, we use absolute values
  // - When values are mixed (both positive and negative), negative slices are hidden
  value: number;
  // Real metric value of the slice displayed in tooltip or total graphic
  rawValue: number;
  normalizedPercentage: number;
  visible: boolean;
  color: string;
  startAngle: number;
  endAngle: number;
  children: SliceTree;
  column?: RemappingHydratedDatasetColumn;
  rowIndex?: number;
  legendHoverIndex?: number;
  isOther?: boolean;
  noHover?: boolean;
  includeInLegend?: boolean;
};

export type SliceTree = Map<string, SliceTreeNode>;

export interface PieChartModel {
  sliceTree: SliceTree;
  total: number;
  numRings: number;
  colDescs: PieColumnDescriptors;
}
