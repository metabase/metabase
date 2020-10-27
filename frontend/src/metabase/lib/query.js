import _ from "underscore";
import Utils from "metabase/lib/utils";

import * as QUERY from "./query/query";
import * as FieldRef from "./query/field_ref";
import { SORTABLE_AGGREGATION_TYPES } from "./query/aggregation";

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

function hasValidBreakout(query) {
  return (
    query &&
    query.breakout &&
    query.breakout.length > 0 &&
    query.breakout[0] !== null
  );
}

function canSortByAggregateField(query, index) {
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
