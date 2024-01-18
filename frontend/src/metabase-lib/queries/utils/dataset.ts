import _ from "underscore";
import type {
  DatasetColumn,
  DatasetData,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";
import Dimension from "metabase-lib/Dimension";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

/**
 * Returns a MBQL field reference (FieldReference) for a given result dataset column
 */
export function fieldRefForColumn(
  column: DatasetColumn,
): FieldReference | null | undefined {
  // NOTE: matching existing behavior of returning the unwrapped base dimension until we understand the implications of changing this
  return (
    column.field_ref &&
    Dimension.parseMBQL(column.field_ref)?.baseDimension().mbql()
  );
}

export function normalizeFieldRef(fieldRef: FieldReference) {
  const dimension = Dimension.parseMBQL(fieldRef);
  return dimension && dimension.mbql();
}

export function findColumnIndexForColumnSetting(
  columns: DatasetColumn[],
  columnSetting: TableColumnOrderSetting,
) {
  const fieldRef = columnSetting.fieldRef;
  // NOTE: need to normalize field refs because they may be old style [fk->, 1, 2]
  const normalizedFieldRef = fieldRef ? normalizeFieldRef(fieldRef) : undefined;
  // first try to find by fieldRef
  if (normalizedFieldRef != null) {
    const dimension = Dimension.parseMBQL(normalizedFieldRef);
    const index = dimension
      ? _.findIndex(columns, col =>
          dimension.isSameBaseDimension(fieldRefForColumn(col)),
        )
      : -1;

    if (index >= 0) {
      return index;
    }
  }
  // if that fails, find by column name
  return _.findIndex(columns, col => col.name === columnSetting.name);
}

export function findColumnSettingIndexForColumn(
  columnSettings: TableColumnOrderSetting[],
  column: DatasetColumn,
) {
  const fieldRef = fieldRefForColumn(column);
  const normalizedFieldRef = fieldRef ? normalizeFieldRef(fieldRef) : undefined;
  if (normalizedFieldRef == null) {
    return columnSettings.findIndex(
      columnSetting => columnSetting.name === column.name,
    );
  }
  const index = columnSettings.findIndex(
    columnSetting =>
      columnSetting.fieldRef &&
      _.isEqual(normalizedFieldRef, normalizeFieldRef(columnSetting.fieldRef)),
  );

  return index;
}
