import * as ML from "cljs/metabase.lib.js";
import type { FieldReference } from "metabase-types/api";
import type { Clause, ColumnMetadata, FieldValuesInfo, Query } from "./types";

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

export function fieldValuesInfo(
  _query: Query,
  _stageIndex: number,
  _column: ColumnMetadata,
): FieldValuesInfo {
  return { fieldId: 1, hasFieldValues: "list" };
}

export function legacyFieldRef(column: ColumnMetadata): FieldReference {
  return ML.legacy_field_ref(column);
}
