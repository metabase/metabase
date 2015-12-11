import inflection from "inflection";
import _ from "underscore";

var Query = {

    isStructured(query) {
        return query && query.type && query.type === "query";
    },

    isNative(query) {
        return query && query.type && query.type === "native";
    },

    canRun(query) {
        return query && query.source_table != undefined && Query.hasValidAggregation(query);
    },

    cleanQuery(query) {
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

    isAggregateField(field) {
        return Array.isArray(field) && field[0] === "aggregation";
    },

    canAddDimensions(query) {
        var MAX_DIMENSIONS = 2;
        return query && query.breakout && (query.breakout.length < MAX_DIMENSIONS);
    },

    numDimensions(query) {
        if (query && query.breakout) {
            return query.breakout.filter(function(b) {
                return b !== null;
            }).length;
        }

        return 0;
    },

    hasValidBreakout(query) {
        return (query && query.breakout &&
                    query.breakout.length > 0 &&
                    query.breakout[0] !== null);
    },

    canSortByAggregateField(query) {
        var SORTABLE_AGGREGATION_TYPES = new Set(["avg", "count", "distinct", "stddev", "sum"]);

        return Query.hasValidBreakout(query) && SORTABLE_AGGREGATION_TYPES.has(query.aggregation[0]);
    },

    addDimension(query) {
        query.breakout.push(null);
    },

    updateDimension(query, dimension, index) {
        query.breakout[index] = dimension;
    },

    removeDimension(query, index) {
        let field = query.breakout.splice(index, 1)[0];

        // remove sorts that referenced the dimension that was removed
        if (query.order_by) {
            query.order_by = query.order_by.filter(s => s[0] !== field);
            if (query.order_by.length === 0) {
                delete query.order_by;
            }
        }
    },

    hasEmptyAggregation(query) {
        var aggregation = query.aggregation;
        if (aggregation !== undefined &&
                aggregation.length > 0 &&
                aggregation[0] !== null) {
            return false;
        }
        return true;
    },

    hasValidAggregation(query) {
        var aggregation = query && query.aggregation;
        if (aggregation &&
                ((aggregation.length === 1 && aggregation[0] !== null) ||
                 (aggregation.length === 2 && aggregation[0] !== null && aggregation[1] !== null))) {
            return true;
        }
        return false;
    },

    isBareRowsAggregation(query) {
        return (query.aggregation &&
                    query.aggregation.length > 0 &&
                    query.aggregation[0] === "rows");
    },

    updateAggregation(query, aggregationClause) {
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

    getFilters(query) {
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

    canAddFilter(query) {
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

    addFilter(query) {
        var queryFilters = Query.getFilters(query);

        if (queryFilters.length === 0) {
            queryFilters = ["AND", [null, null, null]];
        } else {
            queryFilters.push([null, null, null]);
        }

        query.filter = queryFilters;
    },

    updateFilter(query, index, filter) {
        var queryFilters = Query.getFilters(query);

        queryFilters[index] = filter;

        query.filter = queryFilters;
    },

    removeFilter(query, index) {
        var queryFilters = Query.getFilters(query);

        if (queryFilters.length === 2) {
            // this equates to having a single filter because the arry looks like ... ["AND" [a filter def array]]
            queryFilters = [];
        } else {
            queryFilters.splice(index, 1);
        }

        query.filter = queryFilters;
    },

    canAddLimitAndSort(query) {
        if (Query.isBareRowsAggregation(query)) {
            return true;
        } else if (Query.hasValidBreakout(query)) {
            return true;
        } else {
            return false;
        }
    },

    getSortableFields(query, fields) {
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

    addLimit(query) {
        query.limit = null;
    },

    updateLimit(query, limit) {
        query.limit = limit;
    },

    removeLimit(query) {
        delete query.limit;
    },

    canAddSort(query) {
        // TODO: allow for multiple sorting choices
        return false;
    },

    addSort(query) {
        // TODO: make sure people don't try to sort by the same field multiple times
        var order_by = query.order_by;
        if (!order_by) {
            order_by = [];
        }

        order_by.push([null, "ascending"]);
        query.order_by = order_by;
    },

    updateSort(query, index, sort) {
        query.order_by[index] = sort;
    },

    removeSort(query, index) {
        var queryOrderBy = query.order_by;

        if (queryOrderBy.length === 1) {
            delete query.order_by;
        } else {
            queryOrderBy.splice(index, 1);
        }
    },

    isRegularField(field) {
        return typeof field === "number";
    },

    isForeignKeyField(field) {
        return Array.isArray(field) && field[0] === "fk->";
    },

    isDatetimeField(field) {
        return Array.isArray(field) && field[0] === "datetime_field";
    },

    isAggregateField(field) {
        return Array.isArray(field) && field[0] === "aggregation";
    },

    isValidField(field) {
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

    getFieldOptions(fields, includeJoins = false, filterFn = (fields) => fields, usedFields = {}) {
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

    getFieldName(tableMetadata, id) {
        if (Array.isArray(id)) {
            if (id[0] === "fk->") {
                var field = tableMetadata.fields_lookup[id[1]];
                if (field) {
                    return field.display_name + " " + Query.getFieldName(field.target.table, id[2]);
                }
            }
        } else if (tableMetadata.fields_lookup[id]) {
            return tableMetadata.fields_lookup[id].display_name
        }
        return '[unknown]';
    },

    getFilterDescription(tableMetadata, filter) {
        if (filter[0] === "AND" || filter[0] === "OR") {
            return filter.slice(1).map(Query.getFilterDescription.bind(null, tableMetadata)).join(" " + filter[0].toLowerCase() + " ");
        } else {
            return Query.getFieldName(tableMetadata, filter[1]);
        }
    },

    generateQueryDescription(tableMetadata, dataset_query) {
        if (!tableMetadata) {
            return "";
        }

        const getFieldName = Query.getFieldName.bind(null, tableMetadata);
        const query = dataset_query.query;
        let description = inflection.pluralize(tableMetadata.display_name) + " ";

        if (query.aggregation && query.aggregation.length > 0) {
            switch (query.aggregation[0]) {
                case "rows":     description += "raw data"; break;
                case "count":    description += "count"; break;
                case "avg":      description += "average of " + getFieldName(query.aggregation[1]); break;
                case "distinct": description += "distinct values of " + getFieldName(query.aggregation[1]); break;
                case "stddev":   description += "standard deviation of " + getFieldName(query.aggregation[1]); break;
                case "sum":      description += "sum of " + getFieldName(query.aggregation[1]); break;
                case "cum_sum":  description += "cumulative sum of " + getFieldName(query.aggregation[1]); break;
                default:
            }
        }

        if (query.breakout && query.breakout.length > 0) {
            description += ", grouped by " + query.breakout.map((b) => getFieldName(b)).join(" and ");
        }

        var filters = Query.getFilters(dataset_query.query);
        if (filters && filters.length > 0) {
            description += ", filtered by " + Query.getFilterDescription(tableMetadata, filters);
        }

        if (query.order_by && query.order_by.length > 0) {
            description += ", sorted by " + query.order_by.map((ordering) => getFieldName(ordering[0]) + " " + ordering[1]).join(" and ");
        }

        if (query.limit != null) {
            description += ", " + query.limit + " " + inflection.inflect("row", query.limit);
        }

        return description;
    }
}

export default Query;
