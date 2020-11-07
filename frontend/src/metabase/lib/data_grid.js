import { formatValue } from "metabase/lib/formatting";

export function multiLevelPivot(
  data,
  columnColumnIndexes,
  rowColumnIndexes,
  valueColumnIndexes,
) {
  const columnColumnValues = [];
  const rowColumnValues = [];
  const valueColumnValues = {};

  for (const row of data.rows) {
    updateValueObject(row, columnColumnIndexes, columnColumnValues);
    updateValueObject(row, rowColumnIndexes, rowColumnValues);

    const valueKey = getValuesKey(row, columnColumnIndexes, rowColumnIndexes);
    valueColumnValues[valueKey] = valueColumnIndexes.map(index => row[index]);
  }

  const headerRows = new Array(columnColumnIndexes.length)
    .fill(null)
    .map(() => []);
  const [headerFormatters, valueFormatters, rowHeaderFormatters] = [
    columnColumnIndexes,
    valueColumnIndexes,
    rowColumnIndexes,
  ].map(indexes =>
    indexes.map(index => value =>
      formatValue(value, { column: data.cols[index] }),
    ),
  );
  addHeaderRows(headerRows, columnColumnValues, headerFormatters);

  const bodyRows = [];
  addBodyRows(bodyRows, {
    rowColumnValues,
    columnColumnValues,
    valueColumnValues,
    valueFormatters,
    rowHeaderFormatters,
  });

  return {
    headerRows,
    bodyRows,
  };
}

function addHeaderRows(rows, values, formatters, depth = 0) {
  if (values.length === 0) {
    return 1;
  }
  let totalSpan = 0;
  for (const { value, children } of values) {
    const span = addHeaderRows(rows, children, formatters, depth + 1);
    totalSpan += span;
    rows[depth].push({ value: formatters[depth](value), span });
  }
  return totalSpan;
}

function dfs(nodes, currentList = []) {
  if (nodes.length === 0) {
    return [currentList];
  }

  return nodes.flatMap(({ value, children }) =>
    dfs(children, [...currentList, value]),
  );
}

function addBodyRows(
  rows,
  {
    rowColumnValues,
    columnColumnValues,
    valueColumnValues,
    valueFormatters,
    rowHeaderFormatters,
  },
  currentRow,
  valueList = [],
) {
  if (rowColumnValues.length === 0 && valueList.length > 0) {
    const valueKeys = dfs(columnColumnValues).map(l =>
      JSON.stringify(l.concat(valueList)),
    );
    const values = valueKeys.map(valueKey => ({
      value: valueColumnValues[valueKey],
      span: 1,
    }));
    currentRow.push(...values);

    return 1;
  }
  let totalSpan = 0;
  rowColumnValues.forEach(({ value, children }, index) => {
    let row = currentRow;
    if (currentRow === undefined || index > 0) {
      row = [];
      rows.push(row);
    }
    const item = { value: rowHeaderFormatters[0](value) };
    row.push(item);
    const span = addBodyRows(
      rows,
      {
        rowColumnValues: children,
        columnColumnValues,
        valueColumnValues,
        valueFormatters,
        rowHeaderFormatters: rowHeaderFormatters.slice(1),
      },
      row,
      [...valueList, value],
    );
    item.span = span;
    totalSpan += span;
  });
  return totalSpan;
}

function getValuesKey(row, columnColumnIndexes, rowColumnIndexes) {
  return JSON.stringify(
    columnColumnIndexes.concat(rowColumnIndexes).map(index => row[index]),
  );
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
