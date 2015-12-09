import inflection from "inflection";
import _ from "underscore";

var Query = {

    isStructured: function(query) {
        return query && query.type && query.type === "query";
    },

    isNative: function(query) {
        return query && query.type && query.type === "native";
    },

    canRun: function(query) {
        return query && query.source_table != undefined && Query.hasValidAggregation(query);
    },

    cleanQuery: function(query) {
        if (!query) {
            return query;
        }

        // it's possible the user left some half-done parts of the query on screen when they hit the run button, so find those
        // things now and clear them out so that we have a nice clean set of valid clauses in our query

        // breakouts
        if (query.breakout) {
            query.breakout = query.breakout.filter(b => b != null);
        }

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

        if (query.order_by) {
            query.order_by = query.order_by.map((s) => {
                let field = s[0];

                // remove incomplete sorts
                if (!Query.isValidField(field) || s[1] == null) {
                    return null;
                }

                if (Query.isAggregateField(field)) {
                    // remove aggregation sort if we can't sort by this aggregation
                    if (Query.canSortByAggregateField(query)) {
                        return s;
                    }
                } else if (Query.hasValidBreakout(query)) {
                    let exactMatches = query.breakout.filter(b => Query.isSameField(b, field, true));
                    if (exactMatches.length > 0) {
                        return s;
                    }
                    let targetMatches = query.breakout.filter(b => Query.isSameField(b, field, false));
                    if (targetMatches.length > 0) {
                        // query processor expect the order_by clause to match the breakout's datetime_field unit or fk-> target,
                        // so just replace it with the one that matches the target field
                        // NOTE: if we have more than one breakout for the same target field this could match the wrong one
                        if (targetMatches.length > 1) {
                            console.warn("Sort clause matches more than one breakout field", s[0], targetMatches);
                        }
                        return [targetMatches[0], s[1]];
                    }
                } else if (Query.isBareRowsAggregation(query)) {
                    return s;
                }

                // otherwise remove sort if it doesn't have a breakout but isn't a bare rows aggregation
                return null;
            }).filter(s => s != null);

            if (query.order_by.length === 0) {
                delete query.order_by;
            }
        }

        if (typeof query.limit !== "number") {
            delete query.limit;
        }

        return query;
    },

    canAddDimensions: function(query) {
        var MAX_DIMENSIONS = 2;
        return query && query.breakout && (query.breakout.length < MAX_DIMENSIONS);
    },

    numDimensions: function(query) {
        if (query && query.breakout) {
            return query.breakout.filter(function(b) {
                return b !== null;
            }).length;
        }

        return 0;
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
        let field = query.breakout.splice(index, 1)[0];

        // remove sorts that referenced the dimension that was removed
        if (query.order_by) {
            query.order_by = query.order_by.filter(s => s[0] !== field);
            if (query.order_by.length === 0) {
                delete query.order_by;
            }
        }
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
        // when switching to or from "rows" aggregation clear out any sorting clauses
        if ((query.aggregation[0] === "rows" || aggregationClause[0] === "rows") && query.aggregation[0] !== aggregationClause[0]) {
            delete query.order_by;
        }

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
        var queryFilters = Query.getFilters(query);
        if (!queryFilters) {
            return false;
        }
        if (queryFilters.length > 0) {
            var lastFilter = queryFilters[queryFilters.length - 1];
            // simply make sure that there are no null values in the last filter
            for (var i=0; i < lastFilter.length; i++) {
                if (lastFilter[i] === null) {
                    return false
                }
            }
        }
        return true;
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

        if (Query.isBareRowsAggregation(query)) {
            return fields;
        } else if (Query.hasValidBreakout(query)) {
            // further filter field list down to only fields in our breakout clause
            var breakoutFieldList = [];

            query.breakout.map(function (breakoutField) {
                let breakoutFieldId = Query.getFieldTargetId(breakoutField);
                fields.map(function(field) {
                    if (field.id === breakoutFieldId) {
                        breakoutFieldList.push(field);
                    }
                });
            });

            if (Query.canSortByAggregateField(query)) {
                breakoutFieldList.push({
                    id: ["aggregation",  0],
                    name: query.aggregation[0], // e.g. "sum"
                    display_name: query.aggregation[0]
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
    },

    isRegularField: function(field) {
        return typeof field === "number";
    },

    isForeignKeyField: function(field) {
        return Array.isArray(field) && field[0] === "fk->";
    },

    isDatetimeField: function(field) {
        return Array.isArray(field) && field[0] === "datetime_field";
    },

    isAggregateField: function(field) {
        return Array.isArray(field) && field[0] === "aggregation";
    },

    isValidField: function(field) {
        return (
            (Query.isRegularField(field)) ||
            (Query.isForeignKeyField(field) && Query.isRegularField(field[1]) && Query.isRegularField(field[2])) ||
            (Query.isDatetimeField(field)   && Query.isValidField(field[1]) && field[2] === "as" && typeof field[3] === "string") ||
            (Query.isAggregateField(field)  && typeof field[1] === "number")
        );
    },

    isSameField: function(fieldA, fieldB, exact = false) {
        if (exact) {
            return _.isEqual(fieldA, fieldB);
        } else {
            return Query.getFieldTargetId(fieldA) === Query.getFieldTargetId(fieldB);
        }
    },

    // gets the target field ID (recursively) from any type of field, including raw field ID, fk->, and datetime_field cast.
    getFieldTargetId: function(field) {
        if (Query.isRegularField(field)) {
            return field;
        } else if (Query.isForeignKeyField(field)) {
            return Query.getFieldTargetId(field[2]);
        } else if (Query.isDatetimeField(field)) {
            return Query.getFieldTargetId(field[1]);
        }
        console.warn("Unknown field type: ", field);
    },

    // gets the table and field definitions from from a raw, fk->, or datetime_field field
    getFieldTarget: function(field, tableDef) {
        if (Query.isRegularField(field)) {
            return { table: tableDef, field: tableDef.fields_lookup[field] };
        } else if (Query.isForeignKeyField(field)) {
            let fkFieldDef = tableDef.fields_lookup[field[1]];
            let targetTableDef = fkFieldDef.target.table;
            return Query.getFieldTarget(field[2], targetTableDef);
        } else if (Query.isDatetimeField(field)) {
            return Query.getFieldTarget(field[1], tableDef);
        }
        console.warn("Unknown field type: ", field);
    },

    getFieldOptions: function(fields, includeJoins = false, filterFn = (fields) => fields, usedFields = {}) {
        var results = {
            count: 0,
            fields: null,
            fks: []
        };
        // filter based on filterFn, then remove fks if they'll be duplicated in the joins fields
        results.fields = filterFn(fields).filter((f) => !usedFields[f.id] && (f.special_type !== "fk" || !includeJoins));
        results.count += results.fields.length;
        if (includeJoins) {
            results.fks = fields.filter((f) => f.special_type === "fk" && f.target).map((joinField) => {
                var targetFields = filterFn(joinField.target.table.fields).filter(f => (!Array.isArray(f.id) || f.id[0] !== "aggregation") && !usedFields[f.id]);
                results.count += targetFields.length;
                return {
                    field: joinField,
                    fields: targetFields
                }
            }).filter((r) => r.fields.length > 0);
        }
        return results;
    },

    generateQueryDescription: function(dataset_query, tableMetadata) {
        if (!tableMetadata) {
            return "";
        }

        function getFieldName(id, table) {
            if (Query.isForeignKeyField(id)) {
                var field = table.fields_lookup[id[1]];
                if (field) {
                    return field.display_name.replace(/\s+id$/i, "") + " → " + getFieldName(id[2], field.target.table);
                }
            } else if (Query.isDatetimeField(id)) {
                return getFieldName(id[1], table) + " (by " + id[3] + ")";
            } else if (Query.isAggregateField(id)) {
                return "aggregation";
            } else if (table.fields_lookup[id]) {
                return table.fields_lookup[id].display_name
            }
            return '[unknown]';
        }

        function getFilterDescription(filter) {
            if (filter[0] === "AND" || filter[0] === "OR") {
                return filter.slice(1).map(getFilterDescription).join(" " + filter[0].toLowerCase() + " ");
            } else {
                return getFieldName(filter[1], tableMetadata);
            }
        }

        var query = dataset_query.query;

        var name = inflection.pluralize(tableMetadata.display_name) + " ";

        switch (query.aggregation[0]) {
            case "rows":     name += "raw data"; break;
            case "count":    name += "count"; break;
            case "avg":      name += "average of " + getFieldName(query.aggregation[1], tableMetadata); break;
            case "distinct": name += "distinct values of " + getFieldName(query.aggregation[1], tableMetadata); break;
            case "stddev":   name += "standard deviation of " + getFieldName(query.aggregation[1], tableMetadata); break;
            case "sum":      name += "sum of " + getFieldName(query.aggregation[1], tableMetadata); break;
            case "cum_sum":  name += "cumulative sum of " + getFieldName(query.aggregation[1], tableMetadata); break;
            default:
        }

        if (query.breakout && query.breakout.length > 0) {
            name += ", grouped by " + query.breakout.map((b) => getFieldName(b, tableMetadata)).join(" and ");
        }

        var filters = Query.getFilters(dataset_query.query);
        if (filters && filters.length > 0) {
            name += ", filtered by " + getFilterDescription(filters);
        }

        if (query.order_by && query.order_by.length > 0) {
            name += ", sorted by " + query.order_by.map((ordering) => getFieldName(ordering[0], tableMetadata) + " " + ordering[1]).join(" and ");
        }

        if (query.limit != null) {
            name += ", " + query.limit + " " + inflection.inflect("row", query.limit);
        }

        return name;
    }
}

export default Query;
