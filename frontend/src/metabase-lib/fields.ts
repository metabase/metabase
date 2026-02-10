import * as ML from "cljs/metabase.lib.js";
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
  return ML.fields(query, stageIndex);
}

export function withFields(
  query: Query,
  stageIndex: number,
  newFields: ColumnMetadata[],
): Query {
  return ML.with_fields(
    query,
    stageIndex,
    newFields as unknown as Parameters<typeof ML.with_fields>[2],
  );
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
  column: ColumnMetadata | MetricMetadata | SegmentMetadata,
): FieldReference {
  // CLJS returns a generic array — the runtime value matches FieldReference structure
  return ML.legacy_ref(query, stageIndex, column) as unknown as FieldReference;
}
