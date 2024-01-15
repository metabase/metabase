import _ from "underscore";
import Dimension from "metabase-lib/Dimension";

export const datasetContainsNoResults = data =>
  data.rows == null || data.rows.length === 0;

/**
 * Returns a MBQL field reference (FieldReference) for a given result dataset column
 *
 * @param  {Column} column Dataset result column
 * @return {?FieldReference} MBQL field reference
 */
export function fieldRefForColumn(column) {
  // NOTE: matching existing behavior of returning the unwrapped base dimension until we understand the implications of changing this
  return (
    column.field_ref &&
    Dimension.parseMBQL(column.field_ref).baseDimension().mbql()
  );
}

export function normalizeFieldRef(fieldRef) {
  const dimension = Dimension.parseMBQL(fieldRef);
  return dimension && dimension.mbql();
}

export function findColumnIndexForColumnSetting(columns, columnSetting) {
  // NOTE: need to normalize field refs because they may be old style [fk->, 1, 2]
  const fieldRef = normalizeFieldRef(columnSetting.fieldRef);
  // first try to find by fieldRef
  if (fieldRef != null) {
    const dimension = Dimension.parseMBQL(fieldRef);
    const index = _.findIndex(columns, col =>
      dimension.isSameBaseDimension(fieldRefForColumn(col)),
    );
    if (index >= 0) {
      return index;
    }
  }
  // if that fails, find by column name
  return _.findIndex(columns, col => col.name === columnSetting.name);
}

export function findColumnSettingIndexForColumn(columnSettings, column) {
  const fieldRef = normalizeFieldRef(fieldRefForColumn(column));
  if (fieldRef == null) {
    return columnSettings.findIndex(
      columnSetting => columnSetting.name === column.name,
    );
  }
  const index = columnSettings.findIndex(columnSetting =>
    _.isEqual(fieldRef, normalizeFieldRef(columnSetting.fieldRef)),
  );
  return index;
}
