import {
  createFieldReference,
  getDimensionReferenceWithoutBaseType,
  getDimensionReferenceWithoutTemporalUnitAndBinning,
  getNormalizedDimensionReference,
  hasStringFieldName,
  isAggregationReference,
  isDimensionReferenceWithOptions,
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

export type LegacyColumnKeyOptions = {
  excludeBaseType?: boolean;
};

export const getLegacyColumnKey = (
  column: DatasetColumnReference,
  { excludeBaseType }: LegacyColumnKeyOptions = {},
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

  if (isDimensionReferenceWithOptions(fieldRef)) {
    fieldRef = getDimensionReferenceWithoutTemporalUnitAndBinning(fieldRef);
    if (excludeBaseType) {
      fieldRef = getDimensionReferenceWithoutBaseType(fieldRef);
    }
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

/**
 * Gets the corresponding viz settings for the column. We check for both
 * legacy and modern keys because not all viz settings have been migrated.
 * To be extra safe and maintain backward compatibility, we check for the
 * legacy key first.
 *
 * Sometimes the `field_ref` has the `base-type`, sometimes it doesn't. To not
 * break legacy viz settings, try to get the column settings with and without
 * `base-type`.
 */
export const getObjectColumnSettings = (
  settings: Record<string, ColumnSettings> | null | undefined,
  column: DatasetColumnReference,
) => {
  return (
    settings?.[getLegacyColumnKey(column)] ??
    settings?.[getLegacyColumnKey(column, { excludeBaseType: true })] ??
    settings?.[getColumnKey(column)]
  );
};
