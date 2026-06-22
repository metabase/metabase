import type {
  FieldSchema,
  SchemaJavaScriptType,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";

import { getFieldId } from "../query-utils";
import type { ColumnReferenceRuntime } from "../runtime-types";

export const STAGE_INDEX = 0;

const JAVASCRIPT_TYPE_BASE_TYPES: Partial<
  Record<SchemaJavaScriptType, string>
> = {
  number: TYPE.Float,
  boolean: TYPE.Boolean,
  Date: TYPE.DateTime,
};

export const getBaseType = (jsType?: SchemaJavaScriptType): string =>
  jsType != null && jsType in JAVASCRIPT_TYPE_BASE_TYPES
    ? (JAVASCRIPT_TYPE_BASE_TYPES[jsType as SchemaJavaScriptType] ?? TYPE.Text)
    : TYPE.Text;

export const getFieldBaseType = (field: FieldSchema): string =>
  field.baseType ?? getBaseType(field.jsType);

export const getFieldEffectiveType = (field: FieldSchema): string =>
  field.effectiveType ?? getFieldBaseType(field);

export function fieldHasTime(field: FieldSchema): boolean {
  const schemaType = field.effectiveType ?? field.baseType;

  return typeof schemaType === "string" && schemaType.includes(TYPE.DateTime);
}

export function findLibColumn(
  query: Query,
  field: ColumnReferenceRuntime,
  options: Record<string, unknown> = {},
): ColumnMetadata | null {
  if (typeof field === "string") {
    return (
      Lib.filterableColumns(query, STAGE_INDEX).find(
        (column) => Lib.displayInfo(query, STAGE_INDEX, column).name === field,
      ) ?? null
    );
  }

  const fieldId = getFieldId(field);
  if (fieldId != null) {
    const sourceFieldId = field.sourceFieldId;
    const fieldOptions =
      sourceFieldId == null
        ? options
        : { ...options, "source-field": sourceFieldId };

    if (Object.keys(fieldOptions).length > 0) {
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

    return Lib.fieldMetadata(query, fieldId);
  }

  return null;
}
