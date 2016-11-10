import React from "react";

import inflection from "inflection";
import _ from "underscore";

import Utils from "metabase/lib/utils";
import { getOperators } from "metabase/lib/schema_metadata";
import { createLookupByProperty } from "metabase/lib/table";
import { isFK, TYPE } from "metabase/lib/types";


import * as Q from "./query/query";

export const NEW_QUERY_TEMPLATES = {
    query: {
        database: null,
        type: "query",
        query: {
            source_table: null
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
    let dataset_query = Utils.copy(NEW_QUERY_TEMPLATES[type]);

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

const SORTABLE_AGGREGATION_TYPES = new Set(["avg", "count", "distinct", "stddev", "sum", "min", "max"]);

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

        // aggregations
        query.aggregation = Query.getAggregations(query);
        if (query.aggregation.length === 0) {
            delete query.aggregation;
        }

        // breakouts
        query.breakout = Query.getBreakouts(query);
        if (query.breakout.length === 0) {
            delete query.breakout;
        }

        // filters
        const filters = Query.getFilters(query).filter(filter =>
            _.all(filter, a => a != null)
        );
        if (filters.length > 0) {
            query.filter = ["AND", ...filters];
        } else {
            delete query.filter;
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
                    if (Query.canSortByAggregateField(query, field[1])) {
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
                } else if (Query.isBareRows(query)) {
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

    canSortByAggregateField(query, index) {
        if (!Query.hasValidBreakout(query)) {
            return false;
        }
        const aggregations = Query.getAggregations(query);
        return (
            aggregations[index] && aggregations[index][0] &&
            SORTABLE_AGGREGATION_TYPES.has(mbqlCanonicalize(aggregations[index][0]))
        );
    },

    isSegmentFilter(filter) {
        return Array.isArray(filter) && filter[0] === "SEGMENT";
    },

    canAddLimitAndSort(query) {
        if (Query.isBareRows(query)) {
            return true;
        } else if (Query.hasValidBreakout(query)) {
            return true;
        } else {
            return false;
        }
    },

    getSortableFields(query, fields) {
        // in bare rows all fields are sortable, otherwise we only sort by our breakout columns
        if (Query.isBareRows(query)) {
            return fields;
        } else if (Query.hasValidBreakout(query)) {
            // further filter field list down to only fields in our breakout clause
            var breakoutFieldList = [];

            const breakouts = Query.getBreakouts(query);
            breakouts.map(function (breakoutField) {
                const fieldId = Query.getFieldTargetId(breakoutField);
                const field = _.findWhere(fields, { id: fieldId });
                if (field) {
                    breakoutFieldList.push(field);
                }
            });

            const aggregations = Query.getAggregations(query);
            for (const [index, aggregation] of aggregations.entries()) {
                if (Query.canSortByAggregateField(query, index)) {
                    breakoutFieldList.push({
                        id: ["aggregation",  index],
                        name: aggregation[0], // e.g. "sum"
                        display_name: aggregation[0]
                    });
                }
            }

            return breakoutFieldList;
        } else {
            return [];
        }
    },

    canAddSort(query) {
        // TODO: allow for multiple sorting choices
        return false;
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

    getAggregationDescription(tableMetadata, query, options) {
        return conjunctList(Query.getAggregations(query).map(aggregation => {
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
        }), "and");
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

    getAggregationType(aggregation) {
        return aggregation && aggregation[0];
    },

    getAggregationField(aggregation) {
        return aggregation && aggregation[1];
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
        if (Query.isBareRows(query)) {
            if (columns.length === 0) {
                return null;
            }
        } else {
            for (const aggregation of Query.getAggregations(query)) {
                const type = Query.getAggregationType(aggregation)
                columns.push({
                    name: METRIC_NAME_BY_AGGREGATION[type],
                    base_type: METRIC_TYPE_BY_AGGREGATION[type],
                    special_type: TYPE.Number
                });
            }
        }
        return columns;
    }
}

for (const prop in Q) {
    Query[prop] = Q[prop];
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
        if (!breakout) {
            breakout = [];
        }
        return [...breakout.slice(0,index), value, ...breakout.slice(index + 1)];
    },

    removeBreakout(breakout, index) {
        if (!breakout) {
            breakout = [];
        }
        return [...breakout.slice(0,index), ...breakout.slice(index + 1)];
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
