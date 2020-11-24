import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";

export function multiLevelPivot(
  data,
  columnColumnIndexes,
  rowColumnIndexes,
  valueColumnIndexes,
) {
  // we build a tree for each tuple of pivoted column/row values seen in the data
  const columnColumnTree = [];
  const rowColumnTree = [];

  // this stores pivot table values keyed by all pivoted columns
  const valuesByKey = {};

  // loop over the rows to build trees of column/row header data
  for (const row of data.rows) {
    // mutate the trees to add the tuple from the current row
    updateValueObject(row, columnColumnIndexes, columnColumnTree);
    updateValueObject(row, rowColumnIndexes, rowColumnTree);

    // save the value columns keyed by the values in the column/row pivoted columns
    const valueKey = JSON.stringify(
      columnColumnIndexes.concat(rowColumnIndexes).map(index => row[index]),
    );
    valuesByKey[valueKey] = valueColumnIndexes.map(index => row[index]);
  }

  const [headerFormatters, valueFormatters, rowHeaderFormatters] = [
    columnColumnIndexes,
    valueColumnIndexes,
    rowColumnIndexes,
  ].map(indexes =>
    indexes.map(index => value =>
      formatValue(value, { column: data.cols[index] }),
    ),
  );
  const headerRows = getHeaderRows(columnColumnTree, {
    valueColumns: valueColumnIndexes.map(index => data.cols[index]),
    formatters: headerFormatters,
  });

  const bodyRows = getBodyRows(rowColumnTree, {
    columnValueLists: valueLists(columnColumnTree),
    valuesByKey,
    valueColumnCount: valueColumnIndexes.length,
    rowHeaderFormatters,
    valueFormatters,
  });
  const valueColumns = valueColumnIndexes.map(index => data.cols[index]);

  return {
    headerRows,
    bodyRows,
    rowColumnTree,
    topIndex: getIndex(columnColumnTree, { valueColumns }),
    leftIndex: getIndex(rowColumnTree, {}),
    getRowSection: createRowSectionGetter({
      valuesByKey,
      columnColumnTree,
      rowColumnTree,
      valueFormatters,
    }),
  };
}

function createRowSectionGetter({
  valuesByKey,
  columnColumnTree,
  rowColumnTree,
  valueFormatters,
}) {
  return (topValue, leftValue) => {
    const rows = enumerate(
      rowColumnTree.find(node => node.value === leftValue),
    );
    const columns = enumerate(
      columnColumnTree.find(node => node.value === topValue),
    );
    return rows.map(row =>
      columns.flatMap(col => {
        const valueKey = JSON.stringify(col.concat(row));
        const values = valuesByKey[valueKey];
        if (values === undefined) {
          return new Array(valueFormatters).fill(null);
        }
        return values.map((v, i) => valueFormatters[i](v));
      }),
    );
  };
}

function enumerate({ value, children }, path = []) {
  const pathWithValue = [...path, value];
  if (children.length === 0) {
    return [pathWithValue];
  }
  return children.flatMap(child => enumerate(child, pathWithValue));
}

function getIndex(values, { valueColumns = [] } = {}) {
  if (values.length === 0) {
    if (valueColumns.length > 1) {
      // if we have multiple value columns include their column names
      const colNames = valueColumns.map(col => ({ value: col.display_name }));
      return [[colNames]];
    }
    return [];
  }
  return values.map(({ value, children }) => [
    [{ value }],
    ..._.zip(...getIndex(children, { valueColumns })).map(a => a.flat()),
  ]);
}

function getHeaderRows(values, { valueColumns, formatters }) {
  if (values.length === 0) {
    // if we have multiple value columns include their column names
    return valueColumns.length > 1
      ? [valueColumns.map(c => ({ value: c.display_name, span: 1 }))]
      : [];
  }
  const [currentFormatter, ...otherFormatters] = formatters;
  const rowLists = [];
  const currentRow = values.map(({ value, children }) => {
    const rows = getHeaderRows(children, {
      valueColumns,
      formatters: otherFormatters,
    });
    rowLists.push(rows);
    const span =
      rows.length === 0 ? 1 : rows[0].reduce((sum, { span }) => sum + span, 0);
    return { value: currentFormatter(value), span };
  });
  const followingRows = _.zip(...rowLists).map(a => a.flat());
  return [currentRow, ...followingRows];
}

function valueLists(tree, currentList = []) {
  if (tree.length === 0) {
    return [currentList];
  }

  return tree.flatMap(({ value, children }) =>
    valueLists(children, [...currentList, value]),
  );
}

function getBodyRows(tree, context, valueList = []) {
  if (tree.length === 0 && valueList.length > 0) {
    const rowValues = context.columnValueLists.flatMap(list => {
      const valueKey = JSON.stringify(list.concat(valueList));
      const values = context.valuesByKey[valueKey];
      if (values === undefined) {
        return new Array(context.valueColumnCount).fill({
          value: null,
          span: 1,
        });
      }
      return values.map((value, index) => ({
        value: context.valueFormatters[index](value),
        span: 1,
      }));
    });
    return [rowValues];
  }
  return tree.flatMap(({ value, children }, index) => {
    const rows = getBodyRows(children, context, [...valueList, value]);
    const item = {
      value: context.rowHeaderFormatters[valueList.length](value),
      span: rows.length,
    };
    const [first, ...rest] = rows;
    return [[item, ...first], ...rest];
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
