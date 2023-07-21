import * as ML from "cljs/metabase.lib.js";
import type { Clause, ColumnMetadata, Query } from "./types";

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

export function fieldableColumns(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.fieldable_columns(query, stageIndex);
}

export function fieldableColumnsWithJoins(
  query: Query,
  stageIndex: number,
): ColumnMetadata[] {
  return ML.fieldable_columns_with_joins(query, stageIndex);
}

export function legacyFieldRef(column: ColumnMetadata): any[] {
  return ML.legacy_field_ref(column);
}
