'use strict';

var Query = {

    canRun: function(query) {
        if (Query.hasValidAggregation(query)) {
            return true;
        }
        return false;
    },

    cleanQuery: function(query) {
        if (!query) {
            return query;
        }

        // it's possible the user left some half-done parts of the query on screen when they hit the run button, so find those
        // things now and clear them out so that we have a nice clean set of valid clauses in our query

        // TODO: breakouts

        // filters
        var queryFilters = Query.getFilters(query);
        if (queryFilters.length > 1) {
            var hasNullValues = function(arr) {
                for (var j=0; j < arr.length; j++) {
                    if (arr[j] === null) {
                        return true;
                    }
                }

                return false;
            };

            var cleanFilters = [queryFilters[0]];
            for (var i=1; i < queryFilters.length; i++) {
                if (!hasNullValues(queryFilters[i])) {
                    cleanFilters.push(queryFilters[i]);
                }
            }

            if (cleanFilters.length > 1) {
                query.filter = cleanFilters;
            } else {
                query.filter = [];
            }
        }

        // TODO: limit

        // TODO: sort

        return query;
    },

    canAddDimensions: function(query) {
        var MAX_DIMENSIONS = 2;
        return (query.breakout.length < MAX_DIMENSIONS);
    },

    hasValidBreakout: function(query) {
        return (query && query.breakout &&
                    query.breakout.length > 0 &&
                    query.breakout[0] !== null);
    },

    canSortByAggregateField: function(query) {
        var SORTABLE_AGGREGATION_TYPES = new Set(["avg", "count", "distinct", "stddev", "sum"]);

        return Query.hasValidBreakout(query) && SORTABLE_AGGREGATION_TYPES.has(query.aggregation[0]);
    },

    addDimension: function(query) {
        query.breakout.push(null);
    },

    updateDimension: function(query, dimension, index) {
        query.breakout[index] = dimension;
    },

    removeDimension: function(query, index) {
        // TODO: when we remove breakouts we also need to remove any limits/sorts that don't make sense
        query.breakout.splice(index, 1);
    },

    hasEmptyAggregation: function(query) {
        var aggregation = query.aggregation;
        if (aggregation !== undefined &&
                aggregation.length > 0 &&
                aggregation[0] !== null) {
            return false;
        }
        return true;
    },

    hasValidAggregation: function(query) {
        var aggregation = query && query.aggregation;
        if (aggregation &&
                ((aggregation.length === 1 && aggregation[0] !== null) ||
                 (aggregation.length === 2 && aggregation[0] !== null && aggregation[1] !== null))) {
            return true;
        }
        return false;
    },

    isBareRowsAggregation: function(query) {
        return (query.aggregation &&
                    query.aggregation.length > 0 &&
                    query.aggregation[0] === "rows");
    },

    updateAggregation: function(query, aggregationClause) {
        query.aggregation = aggregationClause;

        // for "rows" type aggregation we always clear out any dimensions because they don't make sense
        if (aggregationClause.length > 0 && aggregationClause[0] === "rows") {
            query.breakout = [];
        }
    },

    getFilters: function(query) {
        // Special handling for accessing query filters because it's been fairly complex to deal with their structure.
        // This method provide a unified and consistent view of the filter definition for the rest of the tool to use.

        var queryFilters = query.filter;

        // quick check for older style filter definitions and tweak them to a format we want to work with
        if (queryFilters && queryFilters.length > 0 && queryFilters[0] !== "AND") {
            var reformattedFilters = [];

            for (var i=0; i < queryFilters.length; i++) {
                if (queryFilters[i] !== null) {
                    reformattedFilters = ["AND", queryFilters];
                    break;
                }
            }

            queryFilters = reformattedFilters;
        }

        return queryFilters;
    },

    canAddFilter: function(query) {
        var canAdd = true;
        var queryFilters = Query.getFilters(query);
        if (queryFilters && queryFilters.length > 0) {
            var lastFilter = queryFilters[queryFilters.length - 1];

            // simply make sure that there are no null values in the last filter
            for (var i=0; i < lastFilter.length; i++) {
                if (lastFilter[i] === null) {
                    canAdd = false;
                }
            }
        } else {
            canAdd = false;
        }

        return canAdd;
    },

    addFilter: function(query) {
        var queryFilters = Query.getFilters(query);

        if (queryFilters.length === 0) {
            queryFilters = ["AND", [null, null, null]];
        } else {
            queryFilters.push([null, null, null]);
        }

        query.filter = queryFilters;
    },

    updateFilter: function(query, index, filter) {
        var queryFilters = Query.getFilters(query);

        queryFilters[index] = filter;

        query.filter = queryFilters;
    },

    removeFilter: function(query, index) {
        var queryFilters = Query.getFilters(query);

        if (queryFilters.length === 2) {
            // this equates to having a single filter because the arry looks like ... ["AND" [a filter def array]]
            queryFilters = [];
        } else {
            queryFilters.splice(index, 1);
        }

        query.filter = queryFilters;
    },

    canAddLimitAndSort: function(query) {
        if (Query.isBareRowsAggregation(query)) {
            return true;
        } else if (Query.hasValidBreakout(query)) {
            return true;
        } else {
            return false;
        }
    },

    getSortableFields: function(query, fields) {
        // in bare rows all fields are sortable, otherwise we only sort by our breakout columns

        // start with all fields
        var fieldList = [];
        for(var key in fields) {
            fieldList.push(fields[key]);
        }

        if (Query.isBareRowsAggregation(query)) {
            return fieldList;
        } else if (Query.hasValidBreakout(query)) {
            // further filter field list down to only fields in our breakout clause
            var breakoutFieldList = [];
            query.breakout.map(function (breakoutFieldId) {
                for (var idx in fieldList) {
                    if (fieldList[idx].id === breakoutFieldId) {
                        breakoutFieldList.push(fieldList[idx]);
                    }
                }
            });

            if (Query.canSortByAggregateField(query)) {
                breakoutFieldList.push({
                    id: ["aggregation",  0],
                    name: query.aggregation[0] // e.g. "sum"
                });
            }

            return breakoutFieldList;
        } else {
            return [];
        }
    },

    addLimit: function(query) {
        query.limit = null;
    },

    updateLimit: function(query, limit) {
        query.limit = limit;
    },

    removeLimit: function(query) {
        delete query.limit;
    },

    canAddSort: function(query) {
        // TODO: allow for multiple sorting choices
        return false;
    },

    addSort: function(query) {
        // TODO: make sure people don't try to sort by the same field multiple times
        var order_by = query.order_by;
        if (!order_by) {
            order_by = [];
        }

        order_by.push([null, "ascending"]);
        query.order_by = order_by;
    },

    updateSort: function(query, index, sort) {
        query.order_by[index] = sort;
    },

    removeSort: function(query, index) {
        var queryOrderBy = query.order_by;

        if (queryOrderBy.length === 1) {
            delete query.order_by;
        } else {
            queryOrderBy.splice(index, 1);
        }
    }
}

export default Query;
