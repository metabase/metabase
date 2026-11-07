import * as ML from "cljs/metabase.lib.js";
import type { FieldReference } from "metabase-types/api";

import type {
  Clause,
  ColumnMetadata,
  FieldRemappingInfo,
  FieldSearchInfo,
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

export function fieldSearchInfo(
  query: Query,
  column: ColumnMetadata,
): FieldSearchInfo {
  return ML.field_search_info(query, column);
}

export function fieldRemappingInfo(
  query: Query,
  column: ColumnMetadata,
): FieldRemappingInfo {
  return ML.field_remapping_info(query, column);
}

export function legacyRef(
  query: Query,
  stageIndex: number,
  column: ColumnMetadata | MetricMetadata | SegmentMetadata,
): FieldReference {
  return ML.legacy_ref(query, stageIndex, column);
}
