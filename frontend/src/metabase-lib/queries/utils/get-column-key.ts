import { DatasetColumn } from "metabase-types/api";
import {
  createFieldReference,
  getBaseDimensionReference,
  getDimensionReferenceWithoutOptions,
  getNormalizedDimensionReference,
  hasStringFieldName,
  isAggregationReference,
  isFieldReference,
  isValidDimensionReference,
} from "metabase-lib/references";

export const getColumnKey = (
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

  if (isFieldReference(fieldRef) || isAggregationReference(fieldRef)) {
    fieldRef = getBaseDimensionReference(fieldRef);
  }

  if (isFieldReference(fieldRef)) {
    fieldRef = getDimensionReferenceWithoutOptions(fieldRef, ["join-alias"]);
  }

  const isLegacyRef =
    (isFieldReference(fieldRef) && hasStringFieldName(fieldRef)) ||
    isAggregationReference(fieldRef);

  return JSON.stringify(
    isLegacyRef ? ["name", column.name] : ["ref", fieldRef],
  );
};
