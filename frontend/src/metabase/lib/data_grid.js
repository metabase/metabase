import _ from "underscore";
import { getIn } from "icepick";

import { formatValue } from "metabase/lib/formatting";

export function isPivotGroupColumn(col) {
  return col.name === "pivot-grouping";
}

// This pulls apart the different aggregations that were packed into one result set.
// There's a column indicating which breakouts were used to compute that row.
// We use that column to split apart the data and convert the field refs to indexes.
function splitPivotData(data, rowIndexes, columnIndexes) {
  const groupIndex = data.cols.findIndex(isPivotGroupColumn);
  const columns = data.cols.filter(col => !isPivotGroupColumn(col));
  const breakouts = columns.filter(col => col.source === "breakout");

  const pivotData = _.chain(data.rows)
    .groupBy(row => row[groupIndex])
    .pairs()
    .map(([key, rows]) => {
      key = parseInt(key);
      const indexes = _.range(breakouts.length).filter(
        index => !((1 << index) & key),
      );
      const keyAsIndexes = JSON.stringify(indexes);
      const rowsWithoutColumn = rows.map(row =>
        row.slice(0, groupIndex).concat(row.slice(groupIndex + 1)),
      );

      return [keyAsIndexes, rowsWithoutColumn];
    })
    .object()
    .value();
  return { pivotData, columns };
}

export function multiLevelPivot(
  data,
  columnColumnIndexes,
  rowColumnIndexes,
  valueColumnIndexes,
) {
  const { pivotData, columns } = splitPivotData(
    data,
    rowColumnIndexes,
    columnColumnIndexes,
  );

  // we build a tree for each tuple of pivoted column/row values seen in the data
  const columnColumnTree = [];
  const rowColumnTree = [];

  // this stores pivot table values keyed by all pivoted columns
  const valuesByKey = {};

  // loop over the primary rows to build trees of column/row header data
  const primaryRowsKey = JSON.stringify(
    _.range(columnColumnIndexes.length + rowColumnIndexes.length),
  );
  for (const row of pivotData[primaryRowsKey]) {
    // mutate the trees to add the tuple from the current row
    updateValueObject(row, columnColumnIndexes, columnColumnTree);
    updateValueObject(row, rowColumnIndexes, rowColumnTree);

    // save the value columns keyed by the values in the column/row pivoted columns
    const valueKey = JSON.stringify(
      columnColumnIndexes.concat(rowColumnIndexes).map(index => row[index]),
    );
    const values = valueColumnIndexes.map(index => row[index]);
    valuesByKey[valueKey] = {
      values,
      data: row.map((value, index) => ({ value, col: columns[index] })),
    };
  }

  // build objects to look up subtotal values
  const subtotalValues = {};
  for (const [subtotalName, subtotal] of Object.entries(pivotData)) {
    const indexes = JSON.parse(subtotalName);
    subtotalValues[subtotalName] = {};
    for (const row of subtotal) {
      const valueKey = JSON.stringify(indexes.map(index => row[index]));
      subtotalValues[subtotalName][valueKey] = valueColumnIndexes.map(
        index => row[index],
      );
    }
  }

  const valueFormatters = valueColumnIndexes.map(index => value =>
    formatValue(value, { column: columns[index] }),
  );

  const valueColumns = valueColumnIndexes.map(index => columns[index]);
  const topIndex = getIndex(columnColumnTree, { valueColumns });
  const leftIndex = getIndex(rowColumnTree, {});

  const columnCount = getIndexCount(topIndex);
  const rowCount = getIndexCount(leftIndex);
  return {
    topIndex,
    leftIndex,
    columnCount,
    rowCount,
    getRowSection: createRowSectionGetter({
      valuesByKey,
      columnColumnTree,
      rowColumnTree,
      valueFormatters,
      subtotalValues,
      columnColumnIndexes,
      rowColumnIndexes,
    }),
  };
}

function getIndexCount({ length }) {
  return (
    // we need at least one row/column
    (length === 0 ? 1 : length) +
    // if there are multiple rows/columns, add one for totals
    (length > 1 ? 1 : 0)
  );
}

function createRowSectionGetter({
  valuesByKey,
  columnColumnTree,
  rowColumnTree,
  valueFormatters,
  subtotalValues,
  columnColumnIndexes,
  rowColumnIndexes,
}) {
  const formatValues = values =>
    values === undefined
      ? Array(valueFormatters.length).fill({ value: null })
      : values.map((v, i) => ({ value: valueFormatters[i](v) }));
  const getSubtotals = (breakoutIndexes, values) =>
    formatValues(
      getIn(
        subtotalValues,
        [breakoutIndexes, values].map(a =>
          JSON.stringify(
            _.sortBy(a, (_value, index) => breakoutIndexes[index]),
          ),
        ),
      ),
    ).map(value => ({ ...value, isSubtotal: true }));

  return (columnIndex, rowIndex) => {
    const rows =
      rowIndex >= rowColumnTree.length
        ? [[]]
        : enumerate(rowColumnTree[rowIndex]);
    const columns =
      columnIndex >= columnColumnTree.length
        ? [[]]
        : enumerate(columnColumnTree[columnIndex]);

    const bottomRow =
      rowIndex === rowColumnTree.length && rowColumnTree.length > 0;
    const rightColumn =
      columnIndex === columnColumnTree.length && columnColumnTree.length > 0;
    // totals in the bottom right
    if (bottomRow && rightColumn) {
      return [getSubtotals([], [])];
    }

    // "grand totals" on the bottom
    if (bottomRow) {
      return [columns.flatMap(col => getSubtotals(columnColumnIndexes, col))];
    }

    // "row totals" on the right
    if (rightColumn) {
      const subtotalRows =
        rowColumnIndexes.length > 1
          ? [
              columns.flatMap(col =>
                getSubtotals(rowColumnIndexes.slice(0, -1), [rows[0][0]]),
              ),
            ]
          : [];

      return rows
        .map(row => getSubtotals(rowColumnIndexes, row))
        .concat(subtotalRows);
    }

    const subtotalRows =
      rowColumnIndexes.length > 1
        ? [
            columns.flatMap(col =>
              getSubtotals(
                columnColumnIndexes.concat(rowColumnIndexes.slice(0, 1)),
                col.concat(rows[0][0]),
              ),
            ),
          ]
        : [];

    return rows
      .map(row =>
        columns.flatMap(col => {
          const { values, data } =
            valuesByKey[JSON.stringify(col.concat(row))] || {};
          return formatValues(values).map(o =>
            data === undefined ? o : { ...o, clicked: { data } },
          );
        }),
      )
      .concat(subtotalRows);
  };
}

function enumerate({ value, children }, path = []) {
  const pathWithValue = [...path, value];
  if (children.length === 0) {
    return [pathWithValue];
  }
  return children.flatMap(child => enumerate(child, pathWithValue));
}

function getIndex(values, { valueColumns = [], depth = 0 } = {}) {
  if (values.length === 0) {
    if (valueColumns.length > 1 || (depth === 0 && valueColumns.length > 0)) {
      // if we have multiple value columns include their column names
      const colNames = valueColumns.map(col => ({
        value: col.display_name,
        span: 1,
      }));
      return [[colNames]];
    }
    return [];
  }
  return values.map(({ value, children }) => {
    const foo = _.zip(
      ...getIndex(children, { valueColumns, depth: depth + 1 }),
    ).map(a => a.flat());
    const span = foo.length === 0 ? 1 : foo[foo.length - 1].length;
    return [[{ value, span }], ...foo];
  });
}

function updateValueObject(row, indexes, seenValues) {
  let currentLevelSeenValues = seenValues;
  for (const value of indexes.map(index => row[index])) {
    let seenValue = currentLevelSeenValues.find(d => d.value === value);
    if (seenValue === undefined) {
      seenValue = { value, children: [] };
      currentLevelSeenValues.push(seenValue);
    }
    currentLevelSeenValues = seenValue.children;
  }
}

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

  // fill it up with the data
  for (let j = 0; j < data.rows.length; j++) {
    const normalColIdx = normalValues.lastIndexOf(data.rows[j][normalCol]);
    const pivotColIdx = pivotValues.lastIndexOf(data.rows[j][pivotCol]);

    pivotedRows[normalColIdx][0] = data.rows[j][normalCol];
    pivotedRows[normalColIdx][pivotColIdx] = data.rows[j][cellCol];
  }

  // provide some column metadata to maintain consistency
  const cols = pivotValues.map(function(value, idx) {
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
