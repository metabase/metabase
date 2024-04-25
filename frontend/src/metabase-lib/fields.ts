import * as ML from "cljs/metabase.lib.js";
import type { FieldReference } from "metabase-types/api";

import type {
  Clause,
  ColumnMetadata,
  FieldValuesSearchInfo,
  LegacyMetricMetadata,
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

export function legacyRef(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | LegacyMetricMetadata | SegmentMetadata,
): FieldReference {
  return ML.legacy_ref(query, stageIndex, column);
}
