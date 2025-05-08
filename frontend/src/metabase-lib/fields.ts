import {
  add_field,
  fields as cljs_fields,
  field_values_search_info,
  fieldable_columns,
  legacy_ref,
  remove_field,
  with_fields,
} from "cljs/metabase.lib.js";
import type { FieldReference } from "metabase-types/api";

import type {
  Clause,
  ColumnMetadata,
  FieldValuesSearchInfo,
  MetricMetadata,
  Query,
  SegmentMetadata,
} from "./types";

export function fields(query: Query, stageIndex: number): Clause[] {
  return cljs_fields(query, stageIndex);
}

export function withFields(
  query: Query,
  stageIndex: number,
  newFields: ColumnMetadata[],
): Query {
  return with_fields(query, stageIndex, newFields);
}

export function addField(
  query: Query,
  stageIndex: number,
  newField: ColumnMetadata,
): Query {
  return add_field(query, stageIndex, newField);
}

export function removeField(
  query: Query,
  stageIndex: number,
  targetField: ColumnMetadata,
): Query {
  return remove_field(query, stageIndex, targetField);
}

export function fieldableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return fieldable_columns(query, stageIndex);
}

export function fieldValuesSearchInfo(
  query: Query,
  column: ColumnMetadata,
): FieldValuesSearchInfo {
  return field_values_search_info(query, column);
}

export function legacyRef(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | MetricMetadata | SegmentMetadata,
): FieldReference {
  return legacy_ref(query, stageIndex, column);
}
