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
import type {
  ColumnSettings,
  DatasetColumn,
  VisualizationSettings,
} from "metabase-types/api";

export type DatasetColumnReference = Pick<DatasetColumn, "name" | "field_ref">;

export const getColumnKey = (column: DatasetColumnReference) => {
  return JSON.stringify(["name", column.name]);
};

export const getLegacyColumnKey = (column: DatasetColumnReference) => {
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

export const getColumnNameFromKey = (key: string) => {
  try {
    const [tag, name] = JSON.parse(key);
    return tag === "name" ? name : undefined;
  } catch {
    return undefined;
  }
};

export const getColumnSettings = (
  settings: VisualizationSettings | null | undefined,
  column: DatasetColumnReference,
) => {
  return getObjectColumnSettings(settings?.column_settings, column);
};

// Gets the corresponding viz settings for the column. We check for both
// legacy and modern keys because not all viz settings have been migrated.
// To be extra safe and maintain backward compatibility, we check for the
// legacy key first.
export const getObjectColumnSettings = (
  settings: Record<string, ColumnSettings> | null | undefined,
  column: DatasetColumnReference,
) => {
  return (
    settings?.[getLegacyColumnKey(column)] ?? settings?.[getColumnKey(column)]
  );
};
