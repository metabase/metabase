import type { FieldReference, AggregationReference } from "metabase-types/api";
import type { Column } from "metabase-types/types/Dataset";

export type FieldOrAggregationReference = FieldReference | AggregationReference;

export type PivotSetting = {
  columns: FieldReference[];
  rows: FieldReference[];
  values: AggregationReference[];
};

export interface LeftHeaderItem {
  clicked: { value: string; column: Column };

  isCollapsed: boolean;
  hasChildren: boolean;
  hasSubtotal?: boolean;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;

  depth: number;
  maxDepthBelow: number;
  offset: number;
  span: number; // rows to span

  path: string[];
  rawValue: string;
  value: string;
}
