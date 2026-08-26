import { isNotNull } from "metabase/utils/types";
import {
  getDimensionReferenceWithoutBaseType,
  isDimensionReferenceWithOptions,
} from "metabase-lib/v1/references";
import type {
  ColumnNameCollapsedRowsSetting,
  ColumnNameColumnSplitSetting,
  DatasetColumn,
  DimensionReference,
  FieldReference,
  PivotTableCollapsedRowsSetting,
  PivotTableColumnSplitSetting,
} from "metabase-types/api";

export function isColumnNameColumnSplitSetting(
  setting: PivotTableColumnSplitSetting,
): setting is ColumnNameColumnSplitSetting {
  const { rows = [], columns = [], values = [] } = setting;
  return (
    rows.every((value) => typeof value === "string") &&
    columns.every((value) => typeof value === "string") &&
    values.every((value) => typeof value === "string")
  );
}

export function isColumnNameCollapsedRowsSetting(
  setting: PivotTableCollapsedRowsSetting,
): setting is ColumnNameCollapsedRowsSetting {
  const { rows = [] } = setting;
  return rows.every((value) => typeof value === "string");
}

function migratePivotSetting(
  columns: DatasetColumn[],
  fieldRefs: (FieldReference | null)[] = [],
): string[] {
  const columnNameByFieldRef = Object.fromEntries(
    columns.map((column) => [
      JSON.stringify(getFieldRefForComparison(column.field_ref)),
      column.name,
    ]),
  );

  return fieldRefs
    .map(
      (fieldRef) =>
        columnNameByFieldRef[
          JSON.stringify(getFieldRefForComparison(fieldRef))
        ],
    )
    .filter(isNotNull);
}

/*
  When comparing field refs for pivot viz settings, ignore `base-type`.
  Sometimes it's present, sometimes it's not. New pivot settings use column
  names only and do not depend on field refs.
 */
export function getFieldRefForComparison(
  fieldRef: DimensionReference | null | undefined,
) {
  return fieldRef != null && isDimensionReferenceWithOptions(fieldRef)
    ? getDimensionReferenceWithoutBaseType(fieldRef)
    : fieldRef;
}

// Field ref-based visualization settings are considered legacy and are not used
// for new questions. To not break existing questions we need to support both
// old- and new-style settings until they are fully migrated.
//
// We cannot auto-migrate the settings on read because all existing questions
// visualized as pivot tables would become ad-hoc. To avoid that we only migrate
// the settings when they are modified, and all code that reads the settings
// runs the migration without storing the new value.
export function migratePivotColumnSplitSetting(
  setting: PivotTableColumnSplitSetting,
  columns: DatasetColumn[],
): ColumnNameColumnSplitSetting {
  if (isColumnNameColumnSplitSetting(setting)) {
    return setting;
  }

  return {
    rows: migratePivotSetting(columns, setting.rows),
    columns: migratePivotSetting(columns, setting.columns),
    values: migratePivotSetting(columns, setting.values),
  };
}
