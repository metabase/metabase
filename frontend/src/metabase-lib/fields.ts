import * as ML from "cljs/metabase.lib.js";
import type { FieldReference } from "metabase-types/api";
import type {
  Clause,
  ColumnMetadata,
  MetadataProvider,
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

export function legacyRef(
  column: ColumnMetadata | MetricMetadata | SegmentMetadata,
): FieldReference {
  return ML.legacy_ref(column);
}

/**
 * Info about FieldValues/remapping for the purposes of powering search widgets in filter modals.
 */
export function fieldValuesSearchInfo(
  metadataProviderable: MetadataProvider | Query,
  column: ColumnMetadata,
): FieldValuesSearchInfo {
  return ML.field_values_search_info(metadataProviderable, column);
}

type FieldValuesSearchInfo = {
  // null means that the underlying field was not found
  fieldId: number | null;
  // a note for it below
  searchFieldId: number | null;
  // corresponds to has_field_values property, or "none" if the field is not found
  hasFieldValues: "list" | "search" | "none";
};
