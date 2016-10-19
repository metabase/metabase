import React from "react";

import inflection from "inflection";
import _ from "underscore";

import { getOperators } from "metabase/lib/schema_metadata";
import { createLookupByProperty } from "metabase/lib/table";
import { isFK, TYPE } from "metabase/lib/types";


export const NEW_QUERY_TEMPLATES = {
    query: {
        database: null,
        type: "query",
        query: {
            source_table: null,
            aggregation: ["rows"],
            breakout: [],
            filter: []
        }
    },
    native: {
        database: null,
        type: "native",
        native: {
            query: ""
        }
    }
};

export function createQuery(type = "query", databaseId, tableId) {
    let dataset_query = angular.copy(NEW_QUERY_TEMPLATES[type]);

    if (databaseId) {
        dataset_query.database = databaseId;
    }

    if (type === "query" && databaseId && tableId) {
        dataset_query.query.source_table = tableId;
    }

    return dataset_query;
}


const METRIC_NAME_BY_AGGREGATION = {
    "count": "count",
    "cum_count": "count",
    "sum": "sum",
    "cum_sum": "sum",
    "distinct": "count",
    "avg": "avg",
    "min": "min",
    "max": "max",
}

const METRIC_TYPE_BY_AGGREGATION = {
    "count": TYPE.Integer,
    "cum_count": TYPE.Integer,
    "sum": TYPE.Float,
    "cum_sum": TYPE.Float,
    "distinct": TYPE.Integer,
    "avg": TYPE.Float,
    "min": TYPE.Float,
    "max": TYPE.Float,
}

const mbqlCanonicalize = (a) => typeof a === "string" ? a.toLowerCase().replace(/_/g, "-") : a;
const mbqlCompare = (a, b) => mbqlCanonicalize(a) === mbqlCanonicalize(b)

var Query = {

    isStructured(dataset_query) {
        return dataset_query && dataset_query.type === "query";
    },

    isNative(dataset_query) {
        return dataset_query && dataset_query.type === "native";
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

        if (query.expressions) delete query.expressions['']; // delete any empty expressions

        return query;
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
        var SORTABLE_AGGREGATION_TYPES = new Set(["avg", "count", "distinct", "stddev", "sum", "min", "max"]);

        return Query.hasValidBreakout(query) && SORTABLE_AGGREGATION_TYPES.has(query.aggregation[0]);
    },

    addDimension(query) {
        query.breakout.push(null);
    },

    updateDimension(query, value, index) {
        query.breakout = BreakoutClause.setBreakout(query.breakout, index, value);
    },

    removeDimension(query, index) {
        let field = query.breakout[index];

        // remove the field from the breakout clause
        query.breakout = BreakoutClause.removeBreakout(query.breakout, index);

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
        return (query.aggregation && query.aggregation[0] === "rows");
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
        if (!query) throw 'query is null!';
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
                    return false;
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
            queryFilters = queryFilters.concat([[null, null, null]]);
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
        if (query.order_by) {
            if (query.order_by.length === 1) {
                delete query.order_by;
            } else {
                query.order_by.splice(index, 1);
            }
        }
    },

    getExpressions(query) {
        return query.expressions;
    },

    setExpression(query, name, expression) {
        if (name && expression) {
            let expressions = query.expressions || {};
            expressions[name] = expression;
            query.expressions = expressions;
        }

        return query;
    },

    // remove an expression with NAME. Returns scrubbed QUERY with all references to expression removed.
    removeExpression(query, name) {
        if (!query.expressions) return query;

        delete query.expressions[name];

        if (_.isEmpty(query.expressions)) delete query.expressions;

        // ok, now "scrub" the query to remove any references to the expression
        function isExpressionReference(obj) {
            return obj && obj.constructor === Array && obj.length === 2 && obj[0] === 'expression' && obj[1] === name;
        }

        function removeExpressionReferences(obj) {
            return isExpressionReference(obj) ? null                                         :
                   obj.constructor === Array  ? _.map(obj, removeExpressionReferences)       :
                   typeof obj === 'object'    ? _.mapObject(obj, removeExpressionReferences) :
                                                obj;
        }

        return this.cleanQuery(removeExpressionReferences(query));
    },

    isRegularField(field) {
        return typeof field === "number";
    },

    isLocalField(field) {
        return Array.isArray(field) && mbqlCompare(field[0], "field-id");
    },

    isForeignKeyField(field) {
        return Array.isArray(field) && mbqlCompare(field[0], "fk->");
    },

    isDatetimeField(field) {
        return Array.isArray(field) && mbqlCompare(field[0], "datetime-field");
    },

    isExpressionField(field) {
        return Array.isArray(field) && field.length === 2 && mbqlCompare(field[0], "expression");
    },

    isAggregateField(field) {
        return Array.isArray(field) && mbqlCompare(field[0], "aggregation");
    },

    isValidField(field) {
        return (
            (Query.isRegularField(field)) ||
            (Query.isLocalField(field)) ||
            (Query.isForeignKeyField(field) && Query.isRegularField(field[1]) && Query.isRegularField(field[2])) ||
            (Query.isDatetimeField(field)   && Query.isValidField(field[1]) &&
                (field.length === 4 ?
                    (field[2] === "as" && typeof field[3] === "string") : // deprecated
                    typeof field[2] === "string")) ||
            (Query.isExpressionField(field) && _.isString(field[1])) ||
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
        } else if (Query.isLocalField(field)) {
            return field[1];
        } else if (Query.isForeignKeyField(field)) {
            return Query.getFieldTargetId(field[2]);
        } else if (Query.isDatetimeField(field)) {
            return Query.getFieldTargetId(field[1]);
        }
        console.warn("Unknown field type: ", field);
    },

    // gets the table and field definitions from from a raw, fk->, or datetime_field field
    getFieldTarget: function(field, tableDef, path = []) {
        if (Query.isRegularField(field)) {
            return { table: tableDef, field: Table.getField(tableDef, field), path };
        } else if (Query.isLocalField(field)) {
            return Query.getFieldTarget(field[1], tableDef, path);
        } else if (Query.isForeignKeyField(field)) {
            let fkFieldDef = Table.getField(tableDef, field[1]);
            let targetTableDef = fkFieldDef && fkFieldDef.target.table;
            return Query.getFieldTarget(field[2], targetTableDef, path.concat(fkFieldDef));
        } else if (Query.isDatetimeField(field)) {
            return {
                ...Query.getFieldTarget(field[1], tableDef, path),
                unit: Query.getDatetimeUnit(field)
            };
        } else if (Query.isExpressionField(field)) {
            // hmmm, since this is a dynamic field we'll need to build this here
            let fieldDef = {
                display_name: field[1],
                name: field[1],
                // TODO: we need to do something better here because filtering depends on knowing a sensible type for the field
                base_type: TYPE.Integer,
                operators_lookup: {},
                valid_operators: [],
                active: true,
                fk_target_field_id: null,
                parent_id: null,
                preview_display: true,
                special_type: null,
                target: null,
                visibility_type: "normal"
            };
            fieldDef.valid_operators = getOperators(fieldDef, tableDef);
            fieldDef.operators_lookup = createLookupByProperty(fieldDef.valid_operators, "name");

            return {
                table: tableDef,
                field: fieldDef,
                path: path
            }
        }

        console.warn("Unknown field type: ", field);
    },

    getDatetimeUnit(field) {
        if (field.length === 4) {
            return field[3]; // deprecated
        } else {
            return field[2];
        }
    },

    getFieldOptions(fields, includeJoins = false, filterFn = _.identity, usedFields = {}) {
        var results = {
            count: 0,
            fields: null,
            fks: []
        };
        // filter based on filterFn, then remove fks if they'll be duplicated in the joins fields
        results.fields = filterFn(fields).filter((f) => !usedFields[f.id] && (!isFK(f.special_type) || !includeJoins));
        results.count += results.fields.length;
        if (includeJoins) {
            results.fks = fields.filter((f) => isFK(f.special_type) && f.target).map((joinField) => {
                var targetFields = filterFn(joinField.target.table.fields).filter(f => (!Array.isArray(f.id) || f.id[0] !== "aggregation") && !usedFields[f.id]);
                results.count += targetFields.length;
                return {
                    field: joinField,
                    fields: targetFields
                };
            }).filter((r) => r.fields.length > 0);
        }

        return results;
    },

    getFieldName(tableMetadata, field, options) {
        try {
            if (Query.isRegularField(field)) {
                let fieldDef = Table.getField(tableMetadata, field);
                if (fieldDef) {
                    return fieldDef.display_name.replace(/\s+id\s*$/i, "");
                }
            } else if (Query.isForeignKeyField(field)) {
                let fkFieldDef = Table.getField(tableMetadata, field[1]);
                let targetTableDef = fkFieldDef && fkFieldDef.target.table;
                return [Query.getFieldName(tableMetadata, field[1], options), " → ", Query.getFieldName(targetTableDef, field[2], options)];
            } else if (Query.isDatetimeField(field)) {
                return [Query.getFieldName(tableMetadata, field[1], options), " (" + field[3] + ")"];
            } else if (Query.isExpressionField(field)) {
                return field[1];
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
                case "rows":      return           ["Raw data"];
                case "count":     return              ["Count"];
                case "cum_count": return   ["Cumulative count"];
                case "avg":       return            ["Average of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "distinct":  return    ["Distinct values of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "stddev":    return ["Standard deviation of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "sum":       return                ["Sum of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "cum_sum":   return     ["Cumulative sum of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "max":       return            ["Maximum of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
                case "min":       return            ["Minimum of ", Query.getFieldName(tableMetadata, aggregation[1], options)];
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
    },

    getDatetimeFieldUnit(field) {
        return field && field[3];
    },

    getAggregationType(query) {
        return query && query.aggregation && query.aggregation[0];
    },

    getAggregationField(query) {
        return query && query.aggregation && query.aggregation[1];
    },

    getBreakouts(query) {
        return (query && query.breakout) || [];
    },

    getQueryColumn(tableMetadata, field) {
        let target = Query.getFieldTarget(field, tableMetadata);
        let column = { ...target.field };
        if (Query.isDatetimeField(field)) {
            column.unit = Query.getDatetimeFieldUnit(field);
        }
        return column;
    },

    getQueryColumns(tableMetadata, query) {
        let columns = Query.getBreakouts(query).map(b => Query.getQueryColumn(tableMetadata, b));
        const aggregation = Query.getAggregationType(query);
        if (aggregation === "rows") {
            if (columns.length === 0) {
                return null;
            }
        } else {
            columns.push({
                name: METRIC_NAME_BY_AGGREGATION[aggregation],
                base_type: METRIC_TYPE_BY_AGGREGATION[aggregation],
                special_type: TYPE.Number
            });
        }
        return columns;
    }
}

export const AggregationClause = {

    // predicate function to test if a given aggregation clause is fully formed
    isValid(aggregation) {
        if (aggregation && _.isArray(aggregation) &&
                ((aggregation.length === 1 && aggregation[0] !== null) ||
                 (aggregation.length === 2 && aggregation[0] !== null && aggregation[1] !== null))) {
            return true;
        }
        return false;
    },

    // predicate function to test if the given aggregation clause represents a Bare Rows aggregation
    isBareRows(aggregation) {
        return AggregationClause.isValid(aggregation) && aggregation[0] === "rows";
    },

    // predicate function to test if a given aggregation clause represents a standard aggregation
    isStandard(aggregation) {
        return AggregationClause.isValid(aggregation) && aggregation[0] !== "METRIC";
    },

    // predicate function to test if a given aggregation clause represents a metric
    isMetric(aggregation) {
        return AggregationClause.isValid(aggregation) && aggregation[0] === "METRIC";
    },

    // get the metricId from a metric aggregation clause
    getMetric(aggregation) {
        if (aggregation && AggregationClause.isMetric(aggregation)) {
            return aggregation[1];
        } else {
            return null;
        }
    },

    // get the operator from a standard aggregation clause
    getOperator(aggregation) {
        if (aggregation && aggregation.length > 0 && aggregation[0] !== "METRIC") {
            return aggregation[0];
        } else {
            return null;
        }
    },

    // get the fieldId from a standard aggregation clause
    getField(aggregation) {
        if (aggregation && aggregation.length > 1 && aggregation[0] !== "METRIC") {
            return aggregation[1];
        } else {
            return null;
        }
    },

    // set the fieldId on a standard aggregation clause
    setField(aggregation, fieldId) {
        if (aggregation && aggregation.length > 0 && aggregation[0] && aggregation[0] !== "METRIC") {
            return [aggregation[0], fieldId];
        } else {
            // TODO: is there a better failure response than just returning the aggregation unmodified??
            return aggregation;
        }
    }
}

export const BreakoutClause = {

    setBreakout(breakout, index, value) {
        if (!breakout) return breakout;

        if (breakout.length >= index+1) {
            breakout[index] = value;
            return breakout;

        } else {
            breakout.push(value);
            return breakout;
        }
    },

    removeBreakout(breakout, index) {
        if (breakout && breakout.length >= index+1) {
            breakout.splice(index, 1);
            return breakout;
        } else {
            return breakout;
        }
    }
}

const Table = {
    getField(table, fieldId) {
        if (table) {
            // sometimes we populate fields_lookup, sometimes we don't :(
            if (table.fields_lookup) {
                return table.fields_lookup[fieldId];
            } else {
                return _.findWhere(table.fields, { id: fieldId });
            }
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
