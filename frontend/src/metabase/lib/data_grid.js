import { getIn } from "icepick";
import _ from "underscore";

import * as Pivot from "cljs/metabase.pivot.js";
import { formatValue } from "metabase/lib/formatting";
import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";
import { migratePivotColumnSplitSetting } from "metabase-lib/v1/queries/utils/pivot";

export function isPivotGroupColumn(col) {
  return col.name === "pivot-grouping";
}

export const COLUMN_FORMATTING_SETTING = "table.column_formatting";
export const COLLAPSED_ROWS_SETTING = "pivot_table.collapsed_rows";
export const COLUMN_SPLIT_SETTING = "pivot_table.column_split";
export const COLUMN_SHOW_TOTALS = "pivot_table.column_show_totals";
export const COLUMN_SORT_ORDER = "pivot_table.column_sort_order";
export const COLUMN_SORT_ORDER_ASC = "ascending";
export const COLUMN_SORT_ORDER_DESC = "descending";

export function multiLevelPivot(data, settings) {
  if (!settings[COLUMN_SPLIT_SETTING]) {
    return null;
  }
  const columnSplit = migratePivotColumnSplitSetting(
    settings[COLUMN_SPLIT_SETTING] ?? { rows: [], columns: [], values: [] },
    data.cols,
  );

  const columnsWithoutPivotGroup = data.cols.filter(
    col => !isPivotGroupColumn(col),
  );

  const {
    columns: columnColumnIndexes,
    rows: rowColumnIndexes,
    values: valueColumnIndexes,
  } = _.mapObject(columnSplit, columnNames =>
    columnNames
      .map(columnName =>
        columnsWithoutPivotGroup.findIndex(col => col.name === columnName),
      )
      .filter(index => index !== -1),
  );

  const { pivotData, columns } = Pivot.split_pivot_data(data);

  const columnSettings = columns.map(column => settings.column(column));

  const { rowTree, colTree, valuesByKey } = Pivot.build_pivot_trees(
    pivotData,
    columns,
    rowColumnIndexes,
    columnColumnIndexes,
    valueColumnIndexes,
    settings,
    columnSettings,
  );

  for (const [_key, rowVal] of Object.entries(valuesByKey)) {
    rowVal["valueColumns"] = valueColumnIndexes.map(index => columns[index]);
    for (const [_key, dataVal] of Object.entries(rowVal.data)) {
      dataVal["col"] = columns[dataVal["colIdx"]];
    }
    for (const [_key, dimVal] of Object.entries(rowVal.dimensions)) {
      dimVal["column"] = columns[dimVal["colIdx"]];
    }
  }

  const rowColumnTree = rowTree || [];
  const columnColumnTree = colTree || [];

  const subtotalValues = Pivot.subtotal_values(pivotData, valueColumnIndexes);

  // pivot tables have a lot of repeated values, so we use memoized formatters for each column
  const [valueFormatters, topIndexFormatters, leftIndexFormatters] = [
    valueColumnIndexes,
    columnColumnIndexes,
    rowColumnIndexes,
  ].map(indexes =>
    indexes.map(index =>
      _.memoize(
        value => formatValue(value, columnSettings[index]),
        value => [value, index].join(),
      ),
    ),
  );

  const formatResults = Pivot.process_pivot_table(
    rowColumnTree,
    columnColumnTree,
    rowColumnIndexes,
    columnColumnIndexes,
    valueColumnIndexes,
    columns,
    topIndexFormatters,
    leftIndexFormatters,
    valueFormatters,
    settings,
    columnSettings,
  );

  const { columnIndex, rowIndex, formattedRowTree, formattedColumnTree } =
    formatResults;

  const leftHeaderItems = treeToArray(formattedRowTree.flat());
  const topHeaderItems = treeToArray(formattedColumnTree.flat());

  const primaryRowsKey = JSON.stringify(
    _.range(columnColumnIndexes.length + rowColumnIndexes.length),
  );

  const colorGetter = makeCellBackgroundGetter(
    pivotData[primaryRowsKey],
    columns,
    settings["table.column_formatting"] ?? [],
    true,
  );

  const getRowSection = createRowSectionGetter({
    valuesByKey,
    subtotalValues,
    valueFormatters,
    columnColumnIndexes,
    rowColumnIndexes,
    columnIndex,
    rowIndex,
    colorGetter,
  });

  return {
    leftHeaderItems,
    topHeaderItems,
    rowCount: rowIndex.length,
    columnCount: columnIndex.length,
    rowIndex,
    getRowSection,
    rowIndexes: rowColumnIndexes,
    columnIndexes: columnColumnIndexes,
    valueIndexes: valueColumnIndexes,
  };
}

// The getter returned from this function returns the value(s) at given (column, row) location
function createRowSectionGetter({
  valuesByKey,
  subtotalValues,
  valueFormatters,
  columnColumnIndexes,
  rowColumnIndexes,
  columnIndex,
  rowIndex,
  colorGetter,
}) {
  const formatValues = values =>
    values === undefined
      ? Array(valueFormatters.length).fill({ value: null })
      : values.map((v, i) => ({ value: valueFormatters[i](v) }));
  const getSubtotals = (breakoutIndexes, values, otherAttrs) =>
    formatValues(
      getIn(
        subtotalValues,
        [breakoutIndexes, values].map(a =>
          JSON.stringify(
            _.sortBy(a, (_value, index) => breakoutIndexes[index]),
          ),
        ),
      ),
    ).map(value => ({ ...value, isSubtotal: true, ...otherAttrs }));

  const getter = (columnIdx, rowIdx) => {
    const columnValues = columnIndex[columnIdx] || [];
    const rowValues = rowIndex[rowIdx] || [];
    const indexValues = columnValues.concat(rowValues);
    if (
      rowValues.length < rowColumnIndexes.length ||
      columnValues.length < columnColumnIndexes.length
    ) {
      // if we don't have a full-length key, we're looking for a subtotal
      const rowIndexes = rowColumnIndexes.slice(0, rowValues.length);
      const columnIndexes = columnColumnIndexes.slice(0, columnValues.length);
      const indexes = columnIndexes.concat(rowIndexes);
      const otherAttrs = rowValues.length === 0 ? { isGrandTotal: true } : {};
      return getSubtotals(indexes, indexValues, otherAttrs);
    }
    const { values, data, dimensions, valueColumns } =
      valuesByKey[JSON.stringify(indexValues)] || {};
    return formatValues(values).map((o, index) =>
      data === undefined
        ? o
        : {
            ...o,
            clicked: { data, dimensions },
            backgroundColor: colorGetter(
              values[index],
              o.rowIndex,
              valueColumns[index].name,
            ),
          },
    );
  };
  return _.memoize(getter, (i1, i2) => [i1, i2].join());
}

// Take a tree and produce a flat list used to layout the top/left headers.
// We track the depth, offset, etc to know how to line items up in the headers.
function treeToArray(nodes) {
  const a = [];
  function dfs(nodes, depth, offset, path = []) {
    if (nodes.length === 0) {
      return { span: 1, maxDepth: 0 };
    }
    let totalSpan = 0;
    let maxDepth = 0;
    for (const {
      children,
      rawValue,
      isGrandTotal,
      isValueColumn,
      ...rest
    } of nodes) {
      const pathWithValue =
        isValueColumn || isGrandTotal ? null : [...path, rawValue];
      const item = {
        ...rest,
        rawValue,
        isGrandTotal,
        depth,
        offset,
        hasChildren: children.length > 0,
        path: pathWithValue,
      };
      a.push(item);
      const result = dfs(children, depth + 1, offset, pathWithValue);
      item.span = result.span;
      item.maxDepthBelow = result.maxDepth;
      offset += result.span;
      totalSpan += result.span;
      maxDepth = Math.max(maxDepth, result.maxDepth);
    }
    return { span: totalSpan, maxDepth: maxDepth + 1 };
  }

  dfs(nodes, 0, 0);
  return a;
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
