import type { DatasetColumn } from "metabase-types/api";

/**
 * @returns min and max for a value in a column
 */
export const rangeForValue = (value: unknown, column: DatasetColumn) => {
  if (typeof value === "number" && column?.binning_info?.bin_width) {
    return [value, value + column.binning_info.bin_width];
  }
};
