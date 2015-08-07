'use strict';

var Table = {
    isQueryable: function(table) {
        return table.visibility_type == null;
    }
};


export default Table;
