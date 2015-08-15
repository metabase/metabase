'use strict';
/*global _*/


var DataGrid = {
    pivot: function(data) {
        // find the lowest cardinality dimension and make it our "pivoted" column
        // TODO: we assume dimensions are in the first 2 columns, which is less than ideal
        var pivotCol = 0,
            normalCol = 1,
            pivotColValues = DataGrid.distinctValues(data, pivotCol),
            normalColValues = DataGrid.distinctValues(data, normalCol);
        if (normalColValues.length <= pivotColValues.length) {
            pivotCol = 1;
            normalCol = 0;

            var tmp = pivotColValues;
            pivotColValues = normalColValues;
            normalColValues = tmp;
        }

        // sort the column values sensibly
        pivotColValues.sort();
        normalColValues.sort();

        // make sure that the first element in the pivoted column list is null which makes room for the label of the other column
        pivotColValues.unshift(null);

        // start with an empty grid that we'll fill with the appropriate values
        var pivotedRows = [];
        var emptyRow = Array.apply(null, Array(pivotColValues.length)).map(function() { return null; });
        for (var i=0; i < normalColValues.length; i++) {
            pivotedRows.push(_.clone(emptyRow));
        }

        // fill it up with the data
        for (var j=0; j < data.rows.length; j++) {
            var normalColIdx = normalColValues.lastIndexOf(data.rows[j][normalCol]);
            var pivotColIdx = pivotColValues.lastIndexOf(data.rows[j][pivotCol]);

            pivotedRows[normalColIdx][0] = data.rows[j][normalCol];
            // NOTE: we are hard coding the expectation that the metric is in the 3rd column
            pivotedRows[normalColIdx][pivotColIdx] = data.rows[j][2];
        }

        // provide some column metadata to maintain consistency
        var cols = pivotColValues.map(function(val) {
            var colDef = _.clone(data.cols[pivotCol]);
            colDef['display_name'] = val || "";
            colDef['name'] = val || "";
            return colDef;
        });

        return {
            cols: cols,
            columns: pivotColValues,
            rows: pivotedRows
        };
    },

    distinctValues: function(data, colIdx) {
        var vals = data.rows.map(function(r) {
            return r[colIdx];
        });

        return vals.filter(function(v, i) { return i==vals.lastIndexOf(v); });
    },

    cardinality: function(data, colIdx) {
        return DataGrid.distinctValues(data, colIdx).length;
    }
};


export default DataGrid;
