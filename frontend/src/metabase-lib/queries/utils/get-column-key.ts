import { DatasetColumn } from "metabase-types/api";
import {
  createFieldReference,
  getBaseDimensionReference,
  getDimensionReferenceWithoutOptions,
  getNormalizedDimensionReference,
  hasStringFieldName,
  isAggregationReference,
  isExpressionReference,
  isFieldReference,
  isValidDimensionReference,
} from "metabase-lib/references";

// returns ["name", column.name] in case there is no field_ref. I don't know how this is matched
export const getColumnKey = (
  column: Pick<DatasetColumn, "name" | "field_ref">,
) => {
  // console.trace("getColumnKey", column);
  let fieldRef = column.field_ref;

  // If we don't have a field_ref on the column (as we used to), we create one with the name. this is a legacyRef.
  if (!fieldRef) {
    fieldRef = ["field", column.name, null];
  }

  // validates. legacyRefs are valid by construction.
  if (!isValidDimensionReference(fieldRef)) {
    console.warn("Unknown field_ref", fieldRef);
    return JSON.stringify(fieldRef);
  }

  // might update the options. legacyRefs are not updated.
  fieldRef = getNormalizedDimensionReference(fieldRef);

  // removes temporal-unit and binning. legacyRefs are not updated.
  if (
    isFieldReference(fieldRef) ||
    isExpressionReference(fieldRef) ||
    isAggregationReference(fieldRef)
  ) {
    fieldRef = getBaseDimensionReference(fieldRef);
  }

  const isLegacyRef =
    (isFieldReference(fieldRef) && hasStringFieldName(fieldRef)) ||
    isAggregationReference(fieldRef);

  return JSON.stringify(
    isLegacyRef ? ["name", column.name] : ["ref", fieldRef],
  );
};
