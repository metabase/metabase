import _ from "underscore";

import * as SchemaMetadata from "metabase/lib/schema_metadata";
import { formatValue } from "metabase/lib/formatting";

function compareNumbers(a, b) {
    return a - b;
}

export function pivot(data) {
    // find the lowest cardinality dimension and make it our "pivoted" column
    // TODO: we assume dimensions are in the first 2 columns, which is less than ideal
    var pivotCol = 0,
        normalCol = 1,
        cellCol = 2,
        pivotColValues = distinctValues(data, pivotCol),
        normalColValues = distinctValues(data, normalCol);

    if (normalColValues.length <= pivotColValues.length) {
        pivotCol = 1;
        normalCol = 0;

        var tmp = pivotColValues;
        pivotColValues = normalColValues;
        normalColValues = tmp;
    }

    // sort the column values sensibly
    if (SchemaMetadata.isNumeric(data.cols[pivotCol])) {
        pivotColValues.sort(compareNumbers);
    } else {
        pivotColValues.sort();
    }

    if (SchemaMetadata.isNumeric(data.cols[normalCol])) {
        normalColValues.sort(compareNumbers);
    } else {
        normalColValues.sort();
    }


    // make sure that the first element in the pivoted column list is null which makes room for the label of the other column
    pivotColValues.unshift(data.cols[normalCol].display_name);

    // add a total column, this needs to happen here so that we make space for the eventual total
    pivotColValues = pivotColValues.concat(["Total"])

    // start with an empty grid that we'll fill with the appropriate values
    let pivotedRows = normalColValues.map((normalColValues, index) => {
        const row = pivotColValues.map(() => null);

        // for onVisualizationClick:
        row._dimension = {
            value: normalColValues,
            column: data.cols[normalCol]
        };
        return row;
    })

    // fill it up with the data
    for (var j=0; j < data.rows.length; j++) {
        var normalColIdx = normalColValues.lastIndexOf(data.rows[j][normalCol]);
        var pivotColIdx = pivotColValues.lastIndexOf(data.rows[j][pivotCol]);

        pivotedRows[normalColIdx][0] = data.rows[j][normalCol];

        // NOTE: we are hard coding the expectation that the metric is in the 3rd column
        pivotedRows[normalColIdx][pivotColIdx] = data.rows[j][2];
    }


    // total each row
    pivotedRows.map(row =>
        // the total is the last spot in each row
        row[row.length -1] = row.slice(1, -1).reduce((a, b) => a + b, 0)
    )

    // total each column
    pivotedRows.push(
        pivotColValues.map((value, index) => {
            // skip if we're on the first or last column
            if(index === 0 || index === pivotColValues.length -1) {
                return null
            }
            return data.rows.filter(row => row[pivotCol] === value)
                     .map(row => row[2])
                     .reduce((a, b) => a + b, 0)
        })
    )


    // provide some column metadata to maintain consistency
    const cols = pivotColValues.map(function(value, idx) {
        if (idx === 0) {
            // first column is always the coldef of the normal column
            return data.cols[normalCol];
        }

        var colDef = _.clone(data.cols[cellCol]);
        colDef.name = colDef.display_name = formatValue(value, { column: data.cols[pivotCol] }) || "";
        // for onVisualizationClick:
        colDef._dimension = {
            value: value,
            column: data.cols[pivotCol]
        };
        // delete colDef.id
        return colDef;
    });

    return {
        cols: cols,
        columns: pivotColValues,
        rows: pivotedRows
    };
}

export function distinctValues(data, colIdx) {
    var vals = data.rows.map(function(r) {
        return r[colIdx];
    });

    return vals.filter(function(v, i) { return i==vals.lastIndexOf(v); });
}

export function cardinality(data, colIdx) {
    return distinctValues(data, colIdx).length;
}
