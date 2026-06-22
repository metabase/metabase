import type { FieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";

import type { ColumnReferenceInput } from "../input-types";
import { getFieldId } from "../query-utils";

import {
  STAGE_INDEX,
  getFieldBaseType,
  getFieldEffectiveType,
} from "./query-utils";

export function findLibColumn(
  query: Query,
  field: ColumnReferenceInput,
  options: Record<string, unknown> = {},
): ColumnMetadata | null {
  if (typeof field === "string") {
    return findLibColumnByName(query, field);
  }

  const fieldId = getFieldId(field);

  if (fieldId == null) {
    return null;
  }

  return findLibColumnByFieldId(query, field, fieldId, options);
}

function findLibColumnByName(
  query: Query,
  fieldName: string,
): ColumnMetadata | null {
  return (
    Lib.filterableColumns(query, STAGE_INDEX).find(
      (column) =>
        Lib.displayInfo(query, STAGE_INDEX, column).name === fieldName,
    ) ?? null
  );
}

function findLibColumnByFieldId(
  query: Query,
  field: FieldSchema,
  fieldId: number,
  options: Record<string, unknown>,
): ColumnMetadata | null {
  const fieldOptions = getLibFieldOptions(field, options);

  if (hasFieldOptions(fieldOptions)) {
    return fromLibFieldReference(query, field, fieldId, fieldOptions);
  }

  return Lib.fieldMetadata(query, fieldId);
}

function getLibFieldOptions(
  field: FieldSchema,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const sourceFieldId = field.sourceFieldId;

  return sourceFieldId == null
    ? options
    : { ...options, "source-field": sourceFieldId };
}

function hasFieldOptions(options: Record<string, unknown>) {
  return Object.keys(options).length > 0;
}

function fromLibFieldReference(
  query: Query,
  field: FieldSchema,
  fieldId: number,
  fieldOptions: Record<string, unknown>,
): ColumnMetadata {
  const sourceFieldId = field.sourceFieldId;

  return Lib.fromLegacyColumn(query, STAGE_INDEX, {
    id: fieldId,
    name: field.name,
    display_name: field.displayName ?? field.name,
    source: "fields",
    fk_field_id: sourceFieldId,
    base_type: getFieldBaseType(field),
    effective_type: getFieldEffectiveType(field),
    field_ref: ["field", fieldId, fieldOptions],
  });
}
