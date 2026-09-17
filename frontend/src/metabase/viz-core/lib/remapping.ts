import _ from "underscore";

import type { DatasetData, Series } from "metabase-types/api";

import type {
  RemappingHydratedChartData,
  RemappingHydratedDatasetColumn,
} from "../types";

const getRemapping = (col: RemappingHydratedDatasetColumn) => {
  // keep an existing Map so extractRemappedColumns is idempotent
  if (col.remapping) {
    return col.remapping;
  }
  if (col.remapped_to != null) {
    return new Map();
  }
  return undefined;
};

// removes columns with `remapped_from` property and adds a `remapping` to the appropriate column
export const extractRemappedColumns = (
  data: DatasetData,
): RemappingHydratedChartData => {
  const cols: RemappingHydratedDatasetColumn[] = data.cols.map((col) => ({
    ...col,
    remapped_from_index:
      col.remapped_from != null
        ? _.findIndex(data.cols, (c) => c.name === col.remapped_from)
        : undefined,
    remapping: getRemapping(col),
  }));

  const rows = data.rows.map((row) =>
    row.filter((value, colIndex) => {
      const col = cols[colIndex];
      if (col.remapped_from != null) {
        if (
          col.remapped_from_index == null ||
          !cols[col.remapped_from_index] ||
          !cols[col.remapped_from_index].remapping
        ) {
          console.warn("Invalid remapped_from", col);
          return true;
        }
        cols[col.remapped_from_index].remapped_to_column = col;
        cols[col.remapped_from_index].remapping?.set(
          row[col.remapped_from_index],
          row[colIndex],
        );
        return false;
      } else {
        return true;
      }
    }),
  );
  return {
    ...data,
    rows,
    cols: cols.filter((col) => col.remapped_from == null),
  };
};

export const extractRemappings = (series: Series) => {
  const se = series.map((s) => ({
    ...s,
    data: s.data && extractRemappedColumns(s.data),
  }));
  return se;
};
