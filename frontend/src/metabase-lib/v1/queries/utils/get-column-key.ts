import {
  createFieldReference,
  getBaseDimensionReference,
  getNormalizedDimensionReference,
  hasStringFieldName,
  isAggregationReference,
  isExpressionReference,
  isFieldReference,
  isValidDimensionReference,
} from "metabase-lib/v1/references";
import type { DatasetColumn } from "metabase-types/api";

export const getColumnKey = (column: Pick<DatasetColumn, "name">) => {
  return JSON.stringify(["name", column.name]);
};

export const getLegacyColumnKey = (
  column: Pick<DatasetColumn, "name" | "field_ref">,
) => {
  let fieldRef = column.field_ref;

  if (!fieldRef) {
    fieldRef = createFieldReference(column.name);
  }

  if (!isValidDimensionReference(fieldRef)) {
    console.warn("Unknown field_ref", fieldRef);
    return JSON.stringify(fieldRef);
  }

  fieldRef = getNormalizedDimensionReference(fieldRef);

  if (
    isFieldReference(fieldRef) ||
    isExpressionReference(fieldRef) ||
    isAggregationReference(fieldRef)
  ) {
    fieldRef = getBaseDimensionReference(fieldRef);
  }

  const isNameKey =
    (isFieldReference(fieldRef) && hasStringFieldName(fieldRef)) ||
    isAggregationReference(fieldRef);

  return JSON.stringify(isNameKey ? ["name", column.name] : ["ref", fieldRef]);
};
