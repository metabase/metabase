import _ from "underscore";
import type {
  ConcreteFieldReference,
  DatasetColumn,
  DatasetData,
  FieldReference,
  TableColumnOrderSetting,
} from "metabase-types/api";
import { checkNotNull } from "metabase/lib/types";
import Dimension from "metabase-lib/Dimension";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

/**
 * Returns a MBQL field reference (FieldReference) for a given result dataset column
 */
export function fieldRefForColumn(column: DatasetColumn): FieldReference {
  // NOTE: matching existing behavior of returning the unwrapped base dimension until we understand the implications of changing this
  return (column.field_ref &&
    checkNotNull(Dimension.parseMBQL(column.field_ref))
      .baseDimension()
      .mbql()) as FieldReference;
}

export function normalizeFieldRef(fieldRef: FieldReference) {
  const dimension = Dimension.parseMBQL(fieldRef);
  return dimension && dimension.mbql();
}

export function findColumnIndexForColumnSetting(
  columns: DatasetColumn[],
  columnSetting: TableColumnOrderSetting,
) {
  // NOTE: need to normalize field refs because they may be old style [fk->, 1, 2]
  const fieldRef = normalizeFieldRef(checkNotNull(columnSetting.fieldRef));
  // first try to find by fieldRef
  if (fieldRef != null) {
    const dimension = checkNotNull(Dimension.parseMBQL(fieldRef));
    const index = _.findIndex(columns, col =>
      dimension.isSameBaseDimension(
        fieldRefForColumn(col) as ConcreteFieldReference,
      ),
    );
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
  const fieldRef = normalizeFieldRef(fieldRefForColumn(column));
  if (fieldRef == null) {
    return columnSettings.findIndex(
      columnSetting => columnSetting.name === column.name,
    );
  }
  const index = columnSettings.findIndex(columnSetting =>
    _.isEqual(
      fieldRef,
      normalizeFieldRef(checkNotNull(columnSetting.fieldRef)),
    ),
  );
  return index;
}
