import { formatValue } from "metabase/lib/formatting";

import _ from "underscore";

export function pivot(data, normalCol, pivotCol, cellCol) {
  const { pivotColValues, normalColValues } = distinctValuesSorted(
    data.rows,
    pivotCol,
    normalCol,
  );

  // make sure that the first element in the pivoted column list is null which makes room for the label of the other column
  pivotColValues.unshift(data.cols[normalCol].display_name);

  // start with an empty grid that we'll fill with the appropriate values
  const pivotedRows = normalColValues.map((normalColValues, index) => {
    const row = pivotColValues.map(() => null);
    // for onVisualizationClick:
    row._dimension = {
      value: normalColValues,
      column: data.cols[normalCol],
    };
    return row;
  });

  // fill it up with the data
  for (let j = 0; j < data.rows.length; j++) {
    let normalColIdx = normalColValues.lastIndexOf(data.rows[j][normalCol]);
    let pivotColIdx = pivotColValues.lastIndexOf(data.rows[j][pivotCol]);

    pivotedRows[normalColIdx][0] = data.rows[j][normalCol];
    // NOTE: we are hard coding the expectation that the metric is in the 3rd column
    pivotedRows[normalColIdx][pivotColIdx] = data.rows[j][2];
  }

  // provide some column metadata to maintain consistency
  const cols = pivotColValues.map(function(value, idx) {
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
    columns: pivotColValues,
    rows: pivotedRows,
  };
}

const DEFAULT_COMPARE = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

class SortState {
  constructor(compare = DEFAULT_COMPARE) {
    this.asc = true;
    this.desc = true;
    this.lastValue = undefined;

    this.isGrouped = false;
    this.groupAsc = true;
    this.groupDesc = true;
    this.lastGroupKey = undefined;

    this.compare = compare;
  }
  update(value, groupKey) {
    if (this.lastValue !== undefined) {
      this.asc = this.asc && value >= this.lastValue;
      this.desc = this.desc && value <= this.lastValue;
      if (this.lastGroupKey !== undefined && this.lastGroupKey === groupKey) {
        this.groupAsc = this.groupAsc && value >= this.lastValue;
        this.groupDesc = this.groupDesc && value <= this.lastValue;
        this.isGrouped = true;
      }
    }
    this.lastValue = value;
    this.lastGroupKey = groupKey;
  }
  sort(array) {
    if (!this.isGrouped) {
      console.log("Not grouped");
    } else if (this.groupAsc && this.groupDesc) {
      console.warn("This shouldn't happen");
    } else if (this.groupAsc && !this.asc) {
      console.log("Sorting ascending");
      array.sort(this.compare);
    } else if (this.groupDesc && !this.desc) {
      console.log("Sorting descending");
      array.sort((a, b) => this.compare(b, a));
    }
  }
}

export function distinctValuesSorted(rows, pivotColIdx, normalColIdx) {
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

  const normalColValues = Array.from(normalSet);
  const pivotColValues = Array.from(pivotSet);

  normalSortState.sort(normalColValues);
  pivotSortState.sort(pivotColValues);

  return { normalColValues, pivotColValues };
}
