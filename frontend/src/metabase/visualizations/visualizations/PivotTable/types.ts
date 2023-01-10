import type { FieldReference, AggregationReference } from "metabase-types/api";

export type FieldOrAggregationReference = FieldReference | AggregationReference;

export type PivotSetting = {
  columns: FieldReference[];
  rows: FieldReference[];
  values: AggregationReference[];
};
