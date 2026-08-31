import _ from "underscore";

import * as Pivot from "cljs/metabase.pivot.js";
import { checkNotNull } from "metabase/utils/types";
import { formatValue } from "metabase/value-formatting";
import type {
  BodyItem,
  HeaderItem,
} from "metabase/visualizations/visualizations/PivotTable/types";
import {
  type ComputedVisualizationSettings,
  type PivotedDatasetColumn,
  type PivotedRowValues,
  makeCellBackgroundGetter,
} from "metabase/viz-core";
import { migratePivotColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";
import type {
  DatasetColumn,
  DatasetData,
  RowValue,
  RowValues,
} from "metabase-types/api";

export function isPivotGroupColumn(
  col: Pick<DatasetColumn, "name"> | undefined,
) {
  return col?.name === "pivot-grouping";
}

// Detail rows (real data, not subtotals/totals) have a pivot-grouping of 0;
// Number() so a string-typed value from some drivers still compares.
export function isPivotDetailRow(row: RowValues, pivotGroupingIndex: number) {
  return Number(row[pivotGroupingIndex]) === 0;
}

export const COLUMN_FORMATTING_SETTING = "table.column_formatting";
export const COLLAPSED_ROWS_SETTING = "pivot_table.collapsed_rows";
export const COLUMN_SPLIT_SETTING = "pivot_table.column_split";
export const COLUMN_SHOW_TOTALS = "pivot_table.column_show_totals";
export const COLUMN_SORT_ORDER = "pivot_table.column_sort_order";
export const COLUMN_SORT_ORDER_ASC = "ascending";
export const COLUMN_SORT_ORDER_DESC = "descending";

export type MultiLevelPivotData = {
  leftHeaderItems: HeaderItem[];
  topHeaderItems: HeaderItem[];
  rowCount: number;
  columnCount: number;
  rowIndex: RowValue[][];
  getRowSection: (columnIndex: number, rowIndex: number) => BodyItem[];
  rowIndexes: number[];
  columnIndexes: number[];
  valueIndexes: number[];
  columnsWithoutPivotGroup: DatasetColumn[];
};

type ProcessedPivotTable = Pick<
  MultiLevelPivotData,
  "leftHeaderItems" | "topHeaderItems" | "getRowSection"
> & {
  columnIndex: RowValue[][] | null;
  rowIndex: RowValue[][] | null;
};

export function multiLevelPivot(
  data: Pick<DatasetData, "rows" | "cols">,
  settings: ComputedVisualizationSettings,
): MultiLevelPivotData | null {
  const columnSplitSetting = settings[COLUMN_SPLIT_SETTING];
  if (!columnSplitSetting) {
    return null;
  }
  const columnSplit = migratePivotColumnSplitSetting(
    columnSplitSetting,
    data.cols,
  );

  const columns: DatasetColumn[] = Pivot.columns_without_pivot_group(data.cols);

  const {
    columns: columnIndexes,
    rows: rowIndexes,
    values: valueIndexes,
  } = _.mapObject(columnSplit, (columnNames) =>
    columnNames
      .map((columnName) => columns.findIndex((col) => col.name === columnName))
      .filter((index) => index !== -1),
  );

  const getColumnSettings = checkNotNull(settings.column);
  const columnSettings = columns.map((column) => getColumnSettings(column));

  // pivot tables have a lot of repeated values, so we use memoized formatters for each column
  const [valueFormatters, topIndexFormatters, leftIndexFormatters] = [
    valueIndexes,
    columnIndexes,
    rowIndexes,
  ].map((indexes) =>
    indexes.map((index) =>
      _.memoize(
        (value: RowValue) => formatValue(value, columnSettings[index]),
        (value: RowValue) => JSON.stringify(value) + String(index),
      ),
    ),
  );

  // makeCellBackgroundGetter is wrapped in another callback because `rows` is
  // computed in CLJS by metabase.pivot.core/get-rows-from-pivot-data, and we
  // want to avoid an extra round trip to CLJS (this can probably be improved,
  // maybe by computing background color right before rendering)
  const makeColorGetter = (rows: RowValues[]) => {
    return makeCellBackgroundGetter(
      rows,
      columns,
      settings["table.column_formatting"] ?? [],
      true,
    );
  };

  try {
    const {
      columnIndex,
      rowIndex,
      leftHeaderItems,
      topHeaderItems,
      getRowSection,
    }: ProcessedPivotTable = Pivot.process_pivot_table(
      data,
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

type PivotedTableData = {
  cols: PivotedDatasetColumn[];
  columns: RowValue[];
  rows: PivotedRowValues[];
  sourceRows: (number | null)[][];
  rows_truncated: DatasetData["rows_truncated"];
};

// This is the pivot function used in the normal table visualization.
export function pivot(
  data: Pick<DatasetData, "rows" | "cols" | "rows_truncated">,
  normalCol: number,
  pivotCol: number,
  cellCol: number,
  settings?: ComputedVisualizationSettings,
): PivotedTableData {
  const { pivotValues, normalValues } = distinctValuesSorted(
    data.rows,
    pivotCol,
    normalCol,
  );

  // make sure that the first element in the pivoted column list is null which makes room for the label of the other column
  pivotValues.unshift(data.cols[normalCol].display_name);

  // start with an empty grid that we'll fill with the appropriate values
  const pivotedRows = normalValues.map((normalValue) => {
    const row: PivotedRowValues = pivotValues.map(() => null);
    // for onVisualizationClick:
    row._dimension = {
      value: normalValue,
      column: data.cols[normalCol],
    };
    return row;
  });

  // keep a record of which row the data came from for onVisualizationClick
  const sourceRows: (number | null)[][] = normalValues.map(() =>
    pivotValues.map(() => null),
  );

  // fill it up with the data
  for (let j = 0; j < data.rows.length; j++) {
    const normalColIdx = normalValues.lastIndexOf(data.rows[j][normalCol]);
    const pivotColIdx = pivotValues.lastIndexOf(data.rows[j][pivotCol]);

    pivotedRows[normalColIdx][0] = data.rows[j][normalCol];
    pivotedRows[normalColIdx][pivotColIdx] = data.rows[j][cellCol];
    sourceRows[normalColIdx][pivotColIdx] = j;
  }

  // Use the pivot column's full visualization settings (date_style, time_style, etc.)
  // when formatting headers so units like hour-of-day render as just the hour.
  const pivotColumn = data.cols[pivotCol];
  const pivotColumnSettings = settings?.column?.(pivotColumn) ?? {
    column: pivotColumn,
  };

  // provide some column metadata to maintain consistency
  const cols = pivotValues.map<PivotedDatasetColumn>(function (value, idx) {
    if (idx === 0) {
      // first column is always the coldef of the normal column
      return data.cols[normalCol];
    } else {
      return {
        ...data.cols[cellCol],
        // `name` must be the same for conditional formatting, but put the
        // formatted pivotted value in the `display_name`
        display_name: String(formatValue(value, pivotColumnSettings) || ""),
        // for onVisualizationClick:
        _dimension: {
          value: value,
          column: pivotColumn,
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

function distinctValuesSorted(
  rows: RowValues[],
  pivotColIdx: number,
  normalColIdx: number,
) {
  const normalSet = new Set<RowValue>();
  const pivotSet = new Set<RowValue>();

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

const DEFAULT_COMPARE = (a: RowValue, b: RowValue) => {
  if (typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const left = Number(a);
  const right = Number(b);
  return left < right ? -1 : left > right ? 1 : 0;
};

class SortState {
  compare: (a: RowValue, b: RowValue) => number;

  asc = true;
  desc = true;
  lastValue: RowValue | undefined = undefined;

  groupAsc = true;
  groupDesc = true;
  lastGroupKey: RowValue | undefined = undefined;
  isGrouped = false;

  constructor(compare = DEFAULT_COMPARE) {
    this.compare = compare;
  }
  update(value: RowValue, groupKey: RowValue) {
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
  sort(array: RowValue[]) {
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
