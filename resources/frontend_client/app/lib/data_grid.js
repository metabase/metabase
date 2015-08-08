'use strict';
/*global _*/


var DataGrid = {
    pivot: function(data) {
        // find the lowest cardinality dimension and make it our "pivoted" column
        // TODO: we assume dimensions are in the first 2 columns, which is less than ideal
        var pivotCol = 0,
        	normalCol = 1,
        	pivotColValues = DataGrid.distinctValues(data, pivotCol);
        if (DataGrid.cardinality(data, 1) <= pivotColValues.length) {
        	pivotCol = 1;
        	normalCol = 0;
        	pivotColValues = DataGrid.distinctValues(data, pivotCol);
        }

        // sort the pivot column values sensibly
        pivotColValues.sort();
        pivotColValues.unshift(null);

        // build the pivoted data grid
        var values = data.rows.reduce(function(last, now) {
        	// grab the last "row" from the total dataset (if possible)
        	var row = (last.length > 0) ? last[last.length - 1] : null;
        	if (row === null || row[0] !== now[normalCol]) {
        		row = Array.apply(null, Array(pivotColValues.length)).map(function() { return null; });
        		row[0] = now[normalCol];
        		last.push(row);
        	}

    		// put current value into the result at the correct pivoted index
    		// TODO: we are hard coding to the 3rd value here, assuming that is always the metric :/
    		row[pivotColValues.lastIndexOf(now[pivotCol])] = now[2];

    		return last;

        }, []);

        var cols = pivotColValues.map(function(val) {
        	var colDef = _.clone(data.cols[pivotCol]);
        	colDef['display_name'] = val || "";
        	colDef['name'] = val || "";
        	return colDef;
        });

        return {
        	cols: cols,
        	columns: pivotColValues,
        	rows: values
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
