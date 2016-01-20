import React from "react";

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

    isSegmentFilter(filter) {
        return Array.isArray(filter) && filter[0] === "SEGMENT";
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
            return { table: tableDef, field: tableDef.fields_lookup && tableDef.fields_lookup[field] };
        } else if (Query.isForeignKeyField(field)) {
            let fkFieldDef = tableDef.fields_lookup && tableDef.fields_lookup[field[1]];
            let targetTableDef = fkFieldDef && fkFieldDef.target.table;
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

    getFieldName(tableMetadata, field, options) {
        try {
            if (Query.isRegularField(field)) {
                let fieldDef = tableMetadata.fields_lookup && tableMetadata.fields_lookup[field];
                if (fieldDef) {
                    return fieldDef.display_name.replace(/\s+id\s*$/i, "");
                }
            } else if (Query.isForeignKeyField(field)) {
                let fkFieldDef = tableMetadata.fields_lookup && tableMetadata.fields_lookup[field[1]];
                let targetTableDef = fkFieldDef && fkFieldDef.target.table;
                return [Query.getFieldName(tableMetadata, field[1], options), " → ", Query.getFieldName(targetTableDef, field[2], options)];
            } else if (Query.isDatetimeField(field)) {
                return [Query.getFieldName(tableMetadata, field[1], options), " (" + field[3] + ")"];
            }
        } catch (e) {
            console.warn("Couldn't format field name for field", field, "in table", tableMetadata);
        }
        return "[Unknown Field]";
    },

    getTableDescription(tableMetadata) {
        return [inflection.pluralize(tableMetadata.display_name)];
    },

    getAggregationDescription(tableMetadata, { aggregation }, options) {
        if (aggregation) {
            switch (aggregation[0]) {
                case "METRIC":
                    let metric = _.findWhere(tableMetadata.metrics, { id: aggregation[1] });
                    let name = metric ? metric.name : "[Unknown Metric]";
                    return [options.jsx ? <span className="text-green text-bold">{name}</span> : name];
                case "rows":     return           ["Raw data"];
                case "count":    return              ["Count"];
                case "avg":      return            ["Average of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "distinct": return    ["Distinct values of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "stddev":   return ["Standard deviation of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "sum":      return                ["Sum of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "cum_sum":  return     ["Cumulative sum of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
            }
        }
        return "";
    },

    getBreakoutDescription(tableMetadata, { breakout }, options) {
        if (breakout && breakout.length > 0) {
            return ["Grouped by ", joinList(breakout.map((b) => Query.getFieldName(tableMetadata, b, options)), " and ")];
        }
    },

    getFilterDescription(tableMetadata, query, options) {
        let filters = Query.getFilters(query);
        if (filters && filters.length > 0) {
            return ["Filtered by ", Query.getFilterClauseDescription(tableMetadata, filters, options)];
        }
    },

    getFilterClauseDescription(tableMetadata, filter, options) {
        if (filter[0] === "AND" || filter[0] === "OR") {
            let clauses = filter.slice(1).map((f) => Query.getFilterClauseDescription(tableMetadata, f, options));
            return conjunctList(clauses, filter[0].toLowerCase());
        } else if (filter[0] === "SEGMENT") {
            let segment = _.findWhere(tableMetadata.segments, { id: filter[1] });
            let name = segment ? segment.name : "[Unknown Segment]";
            return options.jsx ? <span className="text-purple text-bold">{name}</span> : name;
        } else {
            return Query.getFieldName(tableMetadata, filter[1], options);
        }
    },

    getOrderByDescription(tableMetadata, { order_by }, options) {
        if (order_by && order_by.length > 0) {
            return ["Sorted by ", joinList(order_by.map(o => Query.getFieldName(tableMetadata, o[0], options) + " " + o[1]), " and ")];
        }
    },

    getLimitDescription(tableMetadata, { limit }) {
        if (limit != null) {
            return [limit, " ", inflection.inflect("row", limit)];
        }
    },

    generateQueryDescription(tableMetadata, query, options = {}) {
        if (!tableMetadata) {
            return "";
        }

        options = {
            jsx: false,
            sections: ["table", "aggregation", "breakout", "filter", "order_by", "limit"],
            ...options
        };

        const sectionFns = {
            table:       Query.getTableDescription,
            aggregation: Query.getAggregationDescription,
            breakout:    Query.getBreakoutDescription,
            filter:      Query.getFilterDescription,
            order_by:    Query.getOrderByDescription,
            limit:       Query.getLimitDescription
        }

        // these array gymnastics are needed to support JSX formatting
        let sections = options.sections
            .map((section) => _.flatten(sectionFns[section](tableMetadata, query, options)).filter(s => !!s))
            .filter(s => s && s.length > 0);

        let description = _.flatten(joinList(sections, ", "));
        if (options.jsx) {
            return <span>{description}</span>;
        } else {
            return description.join("");
        }
    }
}

function joinList(list, joiner) {
    return _.flatten(list.map((l, i) => i === list.length - 1 ? [l] : [l, joiner]), true);
}

function conjunctList(list, conjunction) {
    switch (list.length) {
        case 0: return null;
        case 1: return list[0];
        case 2: return [list[0], " ", conjunction, " ", list[1]];
        default: return [list.slice(0, -1).join(", "), ", ", conjunction, " ", list[list.length - 1]];
    }
}

export default Query;
