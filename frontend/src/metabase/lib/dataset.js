import _ from "underscore";

import type { Value, Column, DatasetData } from "metabase/meta/types/Dataset";

// Many aggregations result in [[null]] if there are no rows to aggregate after filters
export const datasetContainsNoResults = (data: DatasetData): boolean =>
  data.rows.length === 0 || _.isEqual(data.rows, [[null]]);

/**
 * @returns min and max for a value in a column
 */
export const rangeForValue = (
  value: Value,
  column: Column,
): ?[number, number] => {
  if (column && column.binning_info && column.binning_info.bin_width) {
    return [value, value + column.binning_info.bin_width];
  }
};
