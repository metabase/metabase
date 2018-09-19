import * as SchemaMetadata from "metabase/lib/schema_metadata";
import { formatValue } from "metabase/lib/formatting";

import _ from "underscore";

export function pivot(data, normalCol, pivotCol, cellCol) {
  const pivotColValues = distinctValues(data, pivotCol);
  const normalColValues = distinctValues(data, normalCol);

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

export function distinctValues(data, colIndex) {
  return _.uniq(data.rows.map(row => row[colIndex]));
}
