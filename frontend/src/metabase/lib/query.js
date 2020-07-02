import _ from "underscore";
import Utils from "metabase/lib/utils";
import { isFK, TYPE } from "metabase/lib/types";

import * as QUERY from "./query/query";
import * as FieldRef from "./query/field_ref";
export * from "./query/query";
export * from "./query/field_ref";

export const NEW_QUERY_TEMPLATES = {
  query: {
    database: null,
    type: "query",
    query: {
      "source-table": null,
    },
  },
  native: {
    database: null,
    type: "native",
    native: {
      query: "",
    },
  },
};

export function createQuery(type = "query", databaseId, tableId) {
  const dataset_query = Utils.copy(NEW_QUERY_TEMPLATES[type]);

  if (databaseId) {
    dataset_query.database = databaseId;
  }

  if (type === "query" && databaseId && tableId) {
    dataset_query.query["source-table"] = tableId;
  }

  return dataset_query;
}

const METRIC_NAME_BY_AGGREGATION = {
  count: "count",
  "cum-count": "count",
  sum: "sum",
  "cum-sum": "sum",
  distinct: "count",
  avg: "avg",
  min: "min",
  max: "max",
};

const METRIC_TYPE_BY_AGGREGATION = {
  count: TYPE.Integer,
  "cum-count": TYPE.Integer,
  sum: TYPE.Float,
  "cum-sum": TYPE.Float,
  distinct: TYPE.Integer,
  avg: TYPE.Float,
  min: TYPE.Float,
  max: TYPE.Float,
};

const SORTABLE_AGGREGATION_TYPES = new Set([
  "avg",
  "count",
  "distinct",
  "stddev",
  "sum",
  "min",
  "max",
]);

export function isStructured(dataset_query) {
  return dataset_query && dataset_query.type === "query";
}

export function isNative(dataset_query) {
  return dataset_query && dataset_query.type === "native";
}

export function cleanQuery(query) {
  if (!query) {
    return query;
  }

  // it's possible the user left some half-done parts of the query on screen when they hit the run button, so find those
  // things now and clear them out so that we have a nice clean set of valid clauses in our query

  // aggregations
  query.aggregation = QUERY.getAggregations(query);
  if (query.aggregation.length === 0) {
    delete query.aggregation;
  }

  // breakouts
  query.breakout = QUERY.getBreakouts(query);
  if (query.breakout.length === 0) {
    delete query.breakout;
  }

  // filters
  const filters = QUERY.getFilters(query).filter(filter =>
    _.all(filter, a => a != null),
  );
  if (filters.length > 0) {
    query.filter = ["and", ...filters];
  } else {
    delete query.filter;
  }

  if (query["order-by"]) {
    query["order-by"] = query["order-by"]
      .map(s => {
        const [direction, field] = s;

        // remove incomplete sorts
        if (!FieldRef.isValidField(field) || direction == null) {
          return null;
        }

        if (FieldRef.isAggregateField(field)) {
          // remove aggregation sort if we can't sort by this aggregation
          if (canSortByAggregateField(query, field[1])) {
            return s;
          }
        } else if (hasValidBreakout(query)) {
          const exactMatches = query.breakout.filter(b =>
            FieldRef.isSameField(b, field, true),
          );
          if (exactMatches.length > 0) {
            return s;
          }
          const targetMatches = query.breakout.filter(b =>
            FieldRef.isSameField(b, field, false),
          );
          if (targetMatches.length > 0) {
            // query processor expect the order-by clause to match the breakout's datetime-field unit or fk-> target,
            // so just replace it with the one that matches the target field
            // NOTE: if we have more than one breakout for the same target field this could match the wrong one
            if (targetMatches.length > 1) {
              console.warn(
                "Sort clause matches more than one breakout field",
                field,
                targetMatches,
              );
            }
            return [direction, targetMatches[0]];
          }
        } else if (QUERY.isBareRows(query)) {
          return s;
        }

        // otherwise remove sort if it doesn't have a breakout but isn't a bare rows aggregation
        return null;
      })
      .filter(s => s != null);

    if (query["order-by"].length === 0) {
      delete query["order-by"];
    }
  }

  if (typeof query.limit !== "number") {
    delete query.limit;
  }

  if (query.expressions) {
    delete query.expressions[""];
  } // delete any empty expressions

  return query;
}

export function hasValidBreakout(query) {
  return (
    query &&
    query.breakout &&
    query.breakout.length > 0 &&
    query.breakout[0] !== null
  );
}

export function canSortByAggregateField(query, index) {
  if (!hasValidBreakout(query)) {
    return false;
  }
  const aggregations = QUERY.getAggregations(query);
  return (
    aggregations[index] &&
    aggregations[index][0] &&
    SORTABLE_AGGREGATION_TYPES.has(aggregations[index][0])
  );
}

export function getFieldOptions(
  fields,
  includeJoins = false,
  filterFn = _.identity,
  usedFields = {},
) {
  const results = {
    count: 0,
    fields: null,
    fks: [],
  };
  // filter based on filterFn, then remove fks if they'll be duplicated in the joins fields
  results.fields = filterFn(fields).filter(
    f => !usedFields[f.id] && (!isFK(f.special_type) || !includeJoins),
  );
  results.count += results.fields.length;
  if (includeJoins) {
    results.fks = fields
      .filter(f => isFK(f.special_type) && f.target)
      .map(joinField => {
        const targetFields = filterFn(joinField.target.table.fields).filter(
          f =>
            (!Array.isArray(f.id) || f.id[0] !== "aggregation") &&
            !usedFields[f.id],
        );
        results.count += targetFields.length;
        return {
          field: joinField,
          fields: targetFields,
        };
      })
      .filter(r => r.fields.length > 0);
  }

  return results;
}

export function getDatetimeFieldUnit(field) {
  return field && field[3];
}

export function getAggregationType(aggregation) {
  return aggregation && aggregation[0];
}

export function getAggregationField(aggregation) {
  return aggregation && aggregation[1];
}

export function getQueryColumn(tableMetadata, field) {
  const target = FieldRef.getFieldTarget(field, tableMetadata);
  const column = { ...target.field };
  if (FieldRef.isDatetimeField(field)) {
    column.unit = getDatetimeFieldUnit(field);
  }
  return column;
}

export function getQueryColumns(tableMetadata, query) {
  const columns = QUERY.getBreakouts(query).map(b =>
    getQueryColumn(tableMetadata, b),
  );
  if (QUERY.isBareRows(query)) {
    if (columns.length === 0) {
      return null;
    }
  } else {
    for (const aggregation of QUERY.getAggregations(query)) {
      const type = getAggregationType(aggregation);
      columns.push({
        name: METRIC_NAME_BY_AGGREGATION[type],
        base_type: METRIC_TYPE_BY_AGGREGATION[type],
        special_type: TYPE.Number,
      });
    }
  }
  return columns;
}
