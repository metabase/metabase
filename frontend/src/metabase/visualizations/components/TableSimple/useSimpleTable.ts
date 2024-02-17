import { useCallback, useMemo, useState } from "react";
import _ from "underscore";

import { isPositiveInteger } from "metabase/lib/number";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import type { DatasetColumn, DatasetData, RowValue } from "metabase-types/api";
import { isID } from "metabase-lib/types/utils/isa";

type UseSimpleTableOpts = {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
};

export function useSimpleTable({ data, settings }: UseSimpleTableOpts) {
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  const setSort = useCallback(
    colIndex => {
      if (sortColumn === colIndex) {
        setSortDirection(direction => (direction === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(colIndex);
      }
    },
    [sortColumn],
  );

  const { rows, cols } = data;
  const getCellBackgroundColor = settings["table._cell_background_getter"];

  const rowIndexes = useMemo(() => {
    let indexes = _.range(0, rows.length);

    if (sortColumn != null) {
      indexes = _.sortBy(indexes, rowIndex => {
        const value = rows[rowIndex][sortColumn];
        const column = cols[sortColumn];
        return formatCellValueForSorting(value, column);
      });
    }

    if (sortDirection === "desc") {
      indexes.reverse();
    }

    return indexes;
  }, [cols, rows, sortColumn, sortDirection]);

  return {
    rowIndexes,
    sortColumn,
    sortDirection,
    setSort,
    getCellBackgroundColor,
  };
}

function formatCellValueForSorting(value: RowValue, column: DatasetColumn) {
  if (typeof value === "string") {
    if (isID(column) && isPositiveInteger(value)) {
      return parseInt(value, 10);
    }
    // for strings we should be case insensitive
    return value.toLowerCase();
  }
  if (value === null) {
    return undefined;
  }
  return value;
}
