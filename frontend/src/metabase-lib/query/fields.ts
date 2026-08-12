import * as ML from "cljs/metabase.lib.js";
import type {
  FieldReference,
  MetricAgg,
  SegmentFilter,
} from "metabase-types/api";

import type {
  Clause,
  ColumnMetadata,
  FieldValuesSearchInfo,
  MetricMetadata,
  Query,
  SegmentMetadata,
} from "./types";

export function fields(query: Query, stageIndex: number): Clause[] {
  return ML.fields(query, stageIndex);
}

export function withFields(
  query: Query,
  stageIndex: number,
  newFields: ColumnMetadata[],
): Query {
  return ML.with_fields(query, stageIndex, newFields);
}

export function addField(
  query: Query,
  stageIndex: number,
  newField: ColumnMetadata,
): Query {
  return ML.add_field(query, stageIndex, newField);
}

export function removeField(
  query: Query,
  stageIndex: number,
  targetField: ColumnMetadata,
): Query {
  return ML.remove_field(query, stageIndex, targetField);
}

export function fieldableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.fieldable_columns(query, stageIndex);
}

export function fieldValuesSearchInfo(
  query: Query,
  column: ColumnMetadata,
): FieldValuesSearchInfo {
  return ML.field_values_search_info(query, column);
}

export type LegacyRef = FieldReference | MetricAgg | SegmentFilter;

export function legacyRef(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
): FieldReference;
export function legacyRef(
  query: Query,
  stageIndex: number,
  column: MetricMetadata,
): MetricAgg;
export function legacyRef(
  query: Query,
  stageIndex: number,
  column: SegmentMetadata,
): SegmentFilter;
export function legacyRef(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | MetricMetadata | SegmentMetadata,
): LegacyRef {
  const ref = ML.legacy_ref(query, stageIndex, column);
  if (!isLegacyRef(ref)) {
    throw new TypeError("Expected legacy_ref to return a legacy reference");
  }
  return ref;
}

function isLegacyRef(value: unknown): value is LegacyRef {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    (value[0] === "field" ||
      value[0] === "expression" ||
      value[0] === "aggregation" ||
      value[0] === "metric" ||
      value[0] === "segment")
  );
}
