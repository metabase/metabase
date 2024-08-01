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
import type { DatasetColumn, VisualizationSettings } from "metabase-types/api";

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

  const isLegacyRef =
    (isFieldReference(fieldRef) && hasStringFieldName(fieldRef)) ||
    isAggregationReference(fieldRef);

  return JSON.stringify(
    isLegacyRef ? ["name", column.name] : ["ref", fieldRef],
  );
};

export const getColumnSettings = (
  settings: VisualizationSettings,
  column: Pick<DatasetColumn, "name" | "field_ref">,
) => {
  return (
    settings.column_settings?.[getColumnKey(column)] ??
    settings.column_settings?.[getLegacyColumnKey(column)]
  );
};
