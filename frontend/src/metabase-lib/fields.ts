import * as ML from "cljs/metabase.lib.js";
import type { FieldReference } from "metabase-types/api";
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

/**
 * This should only be used to get field IDs when it is necessary, like interacting with backend API parameters.
 * For most purposes, you should be use ColumnMetadata objects and not access field ids directly
 *
 * @param {ColumnMetadata} column
 * @returns {number|string|null} field id
 */
export function _fieldId(column: ColumnMetadata): number | string | null {
  return ML.field_id(column);
}

export function _cardOrTableId(column: ColumnMetadata): number | string | null {
  return ML.legacy_card_or_table_id(column);
}

// TODO: This should be removed and usage replaced with calls to `visibleColumns` and `findColumnIndexesFromLegacyRefs`.
export function findVisibleColumnForLegacyRef(
  query: Query,
  stageIndex: number,
  fieldRef: FieldReference,
): ColumnMetadata | null {
  return ML.find_visible_column_for_legacy_ref(query, stageIndex, fieldRef);
}

export function legacyFieldRef(column: ColumnMetadata): FieldReference {
  return ML.legacy_field_ref(column);
}
