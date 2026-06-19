import Color from "color";
import _ from "underscore";

import * as Pivot from "cljs/metabase.pivot.js";
import { color as mbColor } from "metabase/ui/colors";
import { formatValue } from "metabase/utils/formatting";
import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import { migratePivotColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";

export function isPivotGroupColumn(col) {
  return col.name === "pivot-grouping";
}

// A pivot data set needs the synthetic native handling (where we add the
// pivot-grouping column and re-tag breakout/aggregation columns) when the
// backend pivot pipeline never ran. We detect that by the ABSENCE of the
// backend-added pivot-grouping column. Relying on `col.source === "native"`
// alone is fragile: a native question used as a saved-question / dashboard card
// can have its columns re-sourced to "fields", which would skip the native
// handling and crash the CLJS pivot engine.
export function isNativePivotData(cols) {
  return cols != null && !cols.some(isPivotGroupColumn);
}

export const COLUMN_FORMATTING_SETTING = "table.column_formatting";
export const COLLAPSED_ROWS_SETTING = "pivot_table.collapsed_rows";
export const COLUMN_SPLIT_SETTING = "pivot_table.column_split";
export const COLUMN_SHOW_TOTALS = "pivot_table.column_show_totals";
export const COLUMN_SORT_ORDER = "pivot_table.column_sort_order";
export const COLUMN_SORT_ORDER_ASC = "ascending";
export const COLUMN_SORT_ORDER_DESC = "descending";

// For native SQL queries the backend never adds the pivot-grouping column.
// We synthesize it here so the CLJS pivot engine can process the data.
// When there are multiple row dimensions we also synthesize subtotal rows by
// grouping on each breakout prefix and summing/averaging measure values, so
// the CLJS engine can populate collapsed rows with real aggregated numbers.
// `getColumnSetting` is an optional function (col) => settings; when provided
// it is used to determine whether a value column should be averaged (percent /
// ratio) rather than summed.
function addPivotGroupingToNativeData(data, columnSplit, getColumnSetting) {
  const {
    rows: rowColNames = [],
    columns: colColNames = [],
    values: valueColNames = [],
  } = columnSplit;
  const breakoutNames = new Set([...rowColNames, ...colColNames]);

  // Re-tag columns so split-pivot-data can count breakouts correctly.
  // Row/col dims → "breakout", measures → "aggregation". We tag purely by the
  // column's membership in the split (not by its incoming source), because a
  // native question used as a saved/dashboard card may arrive with source
  // "fields" rather than "native".
  const valueNames = new Set(valueColNames);
  const taggedCols = data.cols.map((col) => {
    if (breakoutNames.has(col.name)) {
      return { ...col, source: "breakout" };
    }
    if (valueNames.has(col.name)) {
      return { ...col, source: "aggregation" };
    }
    return col;
  });

  // Append pivot-grouping column (value 0 = all breakouts active, no subtotals).
  const pivotGroupCol = {
    name: "pivot-grouping",
    display_name: "pivot-grouping",
    base_type: "type/Integer",
    source: "native",
  };
  const cols = [...taggedCols, pivotGroupCol];

  // All breakout column names in order (rows first, then columns partition).
  const allBreakouts = [...rowColNames, ...colColNames];
  const numBreakouts = allBreakouts.length;

  // Index lookup: breakout/value column name → position in original data.cols.
  const colIndexByName = {};
  data.cols.forEach((col, i) => {
    colIndexByName[col.name] = i;
  });

  const breakoutIndexes = allBreakouts.map((name) => colIndexByName[name]);
  const valueIndexes = valueColNames.map((name) => colIndexByName[name]);

  // Determine aggregation type per value column: "avg" for percent/ratio columns, "sum" otherwise.
  const valueAggTypes = valueColNames.map((name) => {
    if (!getColumnSetting) {
      return "sum";
    }
    const col = data.cols[colIndexByName[name]];
    const colSetting = col ? getColumnSetting(col) : null;
    const style = colSetting?.["number_style"];
    return style === "percent" ? "avg" : "sum";
  });

  // Primary rows: every breakout is active → pivot-grouping = 0.
  const primaryRows = data.rows.map((row) => [...row, 0]);

  // Synthesize subtotal rows for each strict prefix of the breakout list,
  // plus the grand total (prefix length 0 = no grouping key).
  // For a prefix of length k (keeping the first k breakouts), the inactive
  // breakouts are indexes k..numBreakouts-1, so the pivot-grouping bitmask is
  // the OR of (1 << i) for i in [k, numBreakouts-1].
  const subtotalRows = [];

  function synthesizeSubtotalRows(prefixLen) {
    let groupingMask = 0;
    for (let i = prefixLen; i < numBreakouts; i++) {
      groupingMask |= 1 << i;
    }

    // Group rows by the first `prefixLen` breakout values and aggregate measures.
    const groups = new Map();
    const counts = new Map(); // per group, per value column index → count of non-null values
    for (const row of data.rows) {
      const key =
        prefixLen === 0
          ? "__grand__"
          : breakoutIndexes
              .slice(0, prefixLen)
              .map((idx) => row[idx])
              .join("\0");
      if (!groups.has(key)) {
        // Seed with the breakout values for this prefix + nulls for the rest.
        const seedRow = [...row];
        // Null out inactive breakout positions.
        for (let i = prefixLen; i < numBreakouts; i++) {
          seedRow[breakoutIndexes[i]] = null;
        }
        // Null out value positions (will be aggregated below).
        for (const vi of valueIndexes) {
          seedRow[vi] = null;
        }
        groups.set(key, seedRow);
        counts.set(key, new Array(valueIndexes.length).fill(0));
      }
      const accRow = groups.get(key);
      const cnt = counts.get(key);
      valueIndexes.forEach((vi, aggIdx) => {
        const v = row[vi];
        if (typeof v === "number" && isFinite(v)) {
          accRow[vi] = (accRow[vi] ?? 0) + v;
          cnt[aggIdx]++;
        }
      });
    }

    for (const [key, accRow] of groups.entries()) {
      const cnt = counts.get(key);
      // For avg-type columns, divide by count to get the mean.
      valueIndexes.forEach((vi, aggIdx) => {
        if (valueAggTypes[aggIdx] === "avg" && cnt[aggIdx] > 0) {
          accRow[vi] = accRow[vi] / cnt[aggIdx];
        }
      });
      subtotalRows.push([...accRow, groupingMask]);
    }
  }

  // Prefix lengths 1..numBreakouts-1 → per-group subtotals.
  for (let prefixLen = 1; prefixLen < numBreakouts; prefixLen++) {
    synthesizeSubtotalRows(prefixLen);
  }
  // Prefix length 0 → grand total (all breakouts inactive).
  synthesizeSubtotalRows(0);

  const rows = [...primaryRows, ...subtotalRows];

  return { ...data, cols, rows };
}

export function multiLevelPivot(data, settings) {
  if (!settings[COLUMN_SPLIT_SETTING]) {
    return null;
  }

  let columnSplit = migratePivotColumnSplitSetting(
    settings[COLUMN_SPLIT_SETTING] ?? { rows: [], columns: [], values: [] },
    data.cols,
  );

  const isNativeQuery = isNativePivotData(data.cols);

  // Native SQL pivots use a single "Breakdown" dimension that should render as a
  // nested row, not as horizontal column groups. Whatever the user placed in the
  // "columns" (Breakdown) partition is appended to rows so the layout is stable
  // regardless of which partition the column was dropped into.
  if (isNativeQuery) {
    columnSplit = {
      ...columnSplit,
      rows: [...(columnSplit.rows ?? []), ...(columnSplit.columns ?? [])],
      columns: [],
    };
  }

  const processedData = isNativeQuery
    ? addPivotGroupingToNativeData(data, columnSplit, settings.column)
    : data;

  const columns = Pivot.columns_without_pivot_group(processedData.cols);

  const {
    columns: columnIndexes,
    rows: rowIndexes,
    values: valueIndexes,
  } = _.mapObject(columnSplit, (columnNames) =>
    columnNames
      .map((columnName) => columns.findIndex((col) => col.name === columnName))
      .filter((index) => index !== -1),
  );

  // The CLJS pivot engine requires at least one value column and at least one
  // row or column index. Without them it tries to access out-of-bounds indexes
  // and throws "No item N in vector of length M".
  if (
    valueIndexes.length === 0 ||
    (rowIndexes.length === 0 && columnIndexes.length === 0)
  ) {
    return null;
  }

  const columnSettings = columns.map((column) => settings.column(column));

  // pivot tables have a lot of repeated values, so we use memoized formatters for each column
  const [valueFormatters, topIndexFormatters, leftIndexFormatters] = [
    valueIndexes,
    columnIndexes,
    rowIndexes,
  ].map((indexes) =>
    indexes.map((index) =>
      _.memoize(
        (value) => formatValue(value, columnSettings[index]),
        (value) => JSON.stringify(value) + String(index),
      ),
    ),
  );

  // Build a set of column names whose number_style is "percent" for the heatmap.
  const percentColNames = new Set(
    columns
      .filter((col, i) => columnSettings[i]?.["number_style"] === "percent")
      .map((col) => col.name),
  );

  // makeCellBackgroundGetter is wrapped in another callback because `rows` is
  // computed in CLJS by metabase.pivot.core/get-rows-from-pivot-data, and we
  // want to avoid an extra round trip to CLJS (this can probably be improved,
  // maybe by computing background color right before rendering)
  const makeColorGetter = (rows) => {
    const conditionalFormatter = makeCellBackgroundGetter(
      rows,
      columns,
      settings["table.column_formatting"] ?? [],
      true,
    );
    return (value, rowIndex, colName) => {
      const conditional = conditionalFormatter(value, rowIndex, colName);
      if (conditional) {
        return conditional;
      }
      if (
        percentColNames.has(colName) &&
        typeof value === "number" &&
        isFinite(value)
      ) {
        const clamped = Math.max(0, Math.min(1, value));
        return Color(mbColor("brand"))
          .mix(Color("white"), 1 - clamped)
          .hex();
      }
      return null;
    };
  };

  try {
    const {
      columnIndex,
      rowIndex,
      leftHeaderItems,
      topHeaderItems,
      getRowSection,
    } = Pivot.process_pivot_table(
      processedData,
      rowIndexes,
      columnIndexes,
      valueIndexes,
      columns,
      topIndexFormatters,
      leftIndexFormatters,
      valueFormatters,
      settings,
      columnSettings,
      makeColorGetter,
    );

    // Ensure we have valid data structures even when totals are disabled
    if (
      !rowIndex ||
      rowIndex.length === 0 ||
      !columnIndex ||
      columnIndex.length === 0
    ) {
      console.warn(
        "Pivot table processing returned empty row or column data, possibly due to disabled totals",
      );
      return null;
    }

    return {
      leftHeaderItems,
      topHeaderItems,
      rowCount: rowIndex.length,
      columnCount: columnIndex.length,
      rowIndex,
      getRowSection,
      rowIndexes: rowIndexes,
      columnIndexes: columnIndexes,
      valueIndexes: valueIndexes,
      columnsWithoutPivotGroup: columns,
    };
  } catch (e) {
    console.error("Error processing pivot table data:", e);
    return null;
  }
}

// This is the pivot function used in the normal table visualization.
export function pivot(data, normalCol, pivotCol, cellCol) {
  const { pivotValues, normalValues } = distinctValuesSorted(
    data.rows,
    pivotCol,
    normalCol,
  );

  // make sure that the first element in the pivoted column list is null which makes room for the label of the other column
  pivotValues.unshift(data.cols[normalCol].display_name);

  // start with an empty grid that we'll fill with the appropriate values
  const pivotedRows = normalValues.map((normalValues, index) => {
    const row = pivotValues.map(() => null);
    // for onVisualizationClick:
    row._dimension = {
      value: normalValues,
      column: data.cols[normalCol],
    };
    return row;
  });

  // keep a record of which row the data came from for onVisualizationClick
  const sourceRows = normalValues.map(() => pivotValues.map(() => null));

  // fill it up with the data
  for (let j = 0; j < data.rows.length; j++) {
    const normalColIdx = normalValues.lastIndexOf(data.rows[j][normalCol]);
    const pivotColIdx = pivotValues.lastIndexOf(data.rows[j][pivotCol]);

    pivotedRows[normalColIdx][0] = data.rows[j][normalCol];
    pivotedRows[normalColIdx][pivotColIdx] = data.rows[j][cellCol];
    sourceRows[normalColIdx][pivotColIdx] = j;
  }

  // provide some column metadata to maintain consistency
  const cols = pivotValues.map(function (value, idx) {
    if (idx === 0) {
      // first column is always the coldef of the normal column
      return data.cols[normalCol];
    } else {
      return {
        ...data.cols[cellCol],
        // `name` must be the same for conditional formatting, but put the
        // formatted pivotted value in the `display_name`
        display_name: formatValue(value, { column: data.cols[pivotCol] }) || "",
        // for onVisualizationClick:
        _dimension: {
          value: value,
          column: data.cols[pivotCol],
        },
      };
    }
  });

  return {
    cols: cols,
    columns: pivotValues,
    rows: pivotedRows,
    sourceRows,
    rows_truncated: data.rows_truncated,
  };
}

function distinctValuesSorted(rows, pivotColIdx, normalColIdx) {
  const normalSet = new Set();
  const pivotSet = new Set();

  const normalSortState = new SortState();
  const pivotSortState = new SortState();

  for (const row of rows) {
    const pivotValue = row[pivotColIdx];
    const normalValue = row[normalColIdx];

    normalSet.add(normalValue);
    pivotSet.add(pivotValue);

    normalSortState.update(normalValue, pivotValue);
    pivotSortState.update(pivotValue, normalValue);
  }

  const normalValues = Array.from(normalSet);
  const pivotValues = Array.from(pivotSet);

  normalSortState.sort(normalValues);
  pivotSortState.sort(pivotValues);

  return { normalValues, pivotValues };
}

// This should work for both strings and numbers
const DEFAULT_COMPARE = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

class SortState {
  constructor(compare = DEFAULT_COMPARE) {
    this.compare = compare;

    this.asc = true;
    this.desc = true;
    this.lastValue = undefined;

    this.groupAsc = true;
    this.groupDesc = true;
    this.lastGroupKey = undefined;
    this.isGrouped = false;
  }
  update(value, groupKey) {
    // skip the first value since there's nothing to compare it to
    if (this.lastValue !== undefined) {
      // compare the current value with the previous value
      const result = this.compare(value, this.lastValue);
      // update global sort state
      this.asc = this.asc && result >= 0;
      this.desc = this.desc && result <= 0;
      if (
        // if current and last values are different
        result !== 0 &&
        // and current and last group are same
        this.lastGroupKey !== undefined &&
        this.lastGroupKey === groupKey
      ) {
        // update grouped sort state
        this.groupAsc = this.groupAsc && result >= 0;
        this.groupDesc = this.groupDesc && result <= 0;
        this.isGrouped = true;
      }
    }
    // update last value and group key
    this.lastValue = value;
    this.lastGroupKey = groupKey;
  }
  sort(array) {
    if (this.isGrouped) {
      if (this.groupAsc && this.groupDesc) {
        console.warn("This shouldn't happen");
      } else if (this.groupAsc && !this.asc) {
        array.sort(this.compare);
      } else if (this.groupDesc && !this.desc) {
        array.sort((a, b) => this.compare(b, a));
      }
    }
  }
}
