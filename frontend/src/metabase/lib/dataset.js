/* @flow */

import _ from "underscore";

import type {
  Value,
  Column,
  ColumnName,
  DatasetData,
} from "metabase/meta/types/Dataset";
import type { Card } from "metabase/meta/types/Card";
import type { ConcreteField } from "metabase/meta/types/Query";

type ColumnSetting = {
  name: ColumnName,
  fieldRef?: ConcreteField,
  enabled: boolean,
};

// Many aggregations result in [[null]] if there are no rows to aggregate after filters
export const datasetContainsNoResults = (data: DatasetData): boolean =>
  data.rows.length === 0 || _.isEqual(data.rows, [[null]]);

/**
 * @returns min and max for a value in a column
 */
export const rangeForValue = (
  value: Value,
  column: ?Column,
): ?[number, number] => {
  if (
    typeof value === "number" &&
    column &&
    column.binning_info &&
    column.binning_info.bin_width
  ) {
    return [value, value + column.binning_info.bin_width];
  }
};

/**
 * Returns a MBQL field reference (ConcreteField) for a given result dataset column
 * @param  {Column} column Dataset result column
 * @return {?ConcreteField} MBQL field reference
 */
export function fieldRefForColumn(column: Column): ?ConcreteField {
  if (column.id != null) {
    if (Array.isArray(column.id)) {
      // $FlowFixMe: sometimes col.id is a field reference (e.x. nested queries), if so just return it
      return column.id;
    } else if (column.fk_field_id != null) {
      return ["fk->", column.fk_field_id, column.id];
    } else {
      return ["field-id", column.id];
    }
  } else if (column.expression_name != null) {
    return ["expression", column.expression_name];
  } else {
    return null;
  }
}

export const keyForColumn = (column: Column): string => {
  const ref = fieldRefForColumn(column);
  return JSON.stringify(ref ? ["ref", ref] : ["name", column.name]);
};

/**
 * Finds the column object from the dataset results for the given `table.columns` column setting
 * @param  {Column[]} columns             Dataset results columns
 * @param  {ColumnSetting} columnSetting  A "column setting" from the `table.columns` settings
 * @return {?Column}                      A result column
 */
export function findColumnForColumnSetting(
  columns: Column[],
  columnSetting: ColumnSetting,
): ?Column {
  const index = findColumnIndexForColumnSetting(columns, columnSetting);
  if (index >= 0) {
    return columns[index];
  } else {
    return null;
  }
}

export function findColumnIndexForColumnSetting(
  columns: Column[],
  columnSetting: ColumnSetting,
): number {
  const { fieldRef } = columnSetting;
  // first try to find by fieldRef
  if (fieldRef != null) {
    const index = _.findIndex(columns, col =>
      _.isEqual(fieldRef, fieldRefForColumn(col)),
    );
    if (index >= 0) {
      return index;
    }
  }
  // if that fails, find by column name
  return _.findIndex(columns, col => col.name === columnSetting.name);
}

/**
 * Synchronizes the "table.columns" visualization setting to the structured
 * query's `fields`
 * @param  {[type]} card Card to synchronize `fields`. Mutates value
 * @param  {[type]} cols Columns in last run results
 */
export function syncQueryFields(card: Card, cols: Column[]): void {
  if (
    card.dataset_query.type === "query" &&
    card.visualization_settings["table.columns"]
  ) {
    const visibleColumns = card.visualization_settings["table.columns"]
      .filter(columnSetting => columnSetting.enabled)
      .map(columnSetting => findColumnForColumnSetting(cols, columnSetting));
    const fields = visibleColumns
      .map(column => column && fieldRefForColumn(column))
      .filter(field => field);
    if (!_.isEqual(card.dataset_query.query.fields, fields)) {
      console.log("fields actual", card.dataset_query.query.fields);
      console.log("fields expected", fields);
      card.dataset_query.query.fields = fields;
    }
  }
}

export function getExistingFields(card: Card, cols: Column[]): ConcreteField[] {
  const query = card.dataset_query.query;
  if (query.fields && query.fields > 0) {
    return query.fields;
  } else if (!query.aggregation && !query.breakout) {
    // $FlowFixMe:
    return cols.map(col => fieldRefForColumn(col)).filter(id => id != null);
  } else {
    return [];
  }
}
