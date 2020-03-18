import React from "react";

import inflection from "inflection";
import _ from "underscore";
import { t } from "ttag";
import Utils from "metabase/lib/utils";
import { isFK, TYPE } from "metabase/lib/types";
import { stripId } from "metabase/lib/formatting";
import { format as formatExpression } from "metabase/lib/expressions/formatter";

import * as A_DEPRECATED from "./query_aggregation";

import * as QUERY from "./query/query";
import * as FIELD_REF from "./query/field_ref";
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
        if (!FIELD_REF.isValidField(field) || direction == null) {
          return null;
        }

        if (FIELD_REF.isAggregateField(field)) {
          // remove aggregation sort if we can't sort by this aggregation
          if (canSortByAggregateField(query, field[1])) {
            return s;
          }
        } else if (hasValidBreakout(query)) {
          const exactMatches = query.breakout.filter(b =>
            FIELD_REF.isSameField(b, field, true),
          );
          if (exactMatches.length > 0) {
            return s;
          }
          const targetMatches = query.breakout.filter(b =>
            FIELD_REF.isSameField(b, field, false),
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

export function formatField(fieldDef, options = {}) {
  const name = stripId(fieldDef && (fieldDef.display_name || fieldDef.name));
  return name;
}

export function getFieldName(tableMetadata, field, options) {
  try {
    const target = FIELD_REF.getFieldTarget(field, tableMetadata);
    const components = [];
    if (target.path) {
      for (const fieldDef of target.path) {
        components.push(formatField(fieldDef, options), " → ");
      }
    }
    components.push(formatField(target.field, options));
    if (target.unit) {
      components.push(` (${target.unit})`);
    }
    return components;
  } catch (e) {
    console.warn(
      "Couldn't format field name for field",
      field,
      "in table",
      tableMetadata,
    );
  }
  return "[Unknown Field]";
}

export function getTableDescription(tableMetadata) {
  return [inflection.pluralize(tableMetadata.display_name)];
}

export function getAggregationDescription(tableMetadata, query, options) {
  return conjunctList(
    QUERY.getAggregations(query).map(aggregation => {
      if (A_DEPRECATED.hasOptions(aggregation)) {
        if (A_DEPRECATED.isNamed(aggregation)) {
          return [A_DEPRECATED.getName(aggregation)];
        }
        aggregation = A_DEPRECATED.getContent(aggregation);
      }
      if (A_DEPRECATED.isMetric(aggregation)) {
        const metric = _.findWhere(tableMetadata.metrics, {
          id: A_DEPRECATED.getMetric(aggregation),
        });
        const name = metric ? metric.name : "[Unknown Metric]";
        return [
          options.jsx ? (
            <span className="text-green text-bold">{name}</span>
          ) : (
            name
          ),
        ];
      }
      switch (aggregation[0]) {
        case "rows":
          return [t`Raw data`];
        case "count":
          return [t`Count`];
        case "cum-count":
          return [t`Cumulative count`];
        case "avg":
          return [
            t`Average of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        case "distinct":
          return [
            t`Distinct values of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        case "stddev":
          return [
            t`Standard deviation of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        case "sum":
          return [
            t`Sum of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        case "cum-sum":
          return [
            t`Cumulative sum of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        case "max":
          return [
            t`Maximum of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        case "min":
          return [
            t`Minimum of `,
            getFieldName(tableMetadata, aggregation[1], options),
          ];
        default:
          return [formatExpression(aggregation, { tableMetadata })];
      }
    }),
    "and",
  );
}

export function getBreakoutDescription(tableMetadata, { breakout }, options) {
  if (breakout && breakout.length > 0) {
    return [
      t`Grouped by `,
      joinList(
        breakout.map(b => getFieldName(tableMetadata, b, options)),
        " and ",
      ),
    ];
  }
}

export function getFilterDescription(tableMetadata, query, options) {
  // getFilters returns list of filters without the implied "and"
  const filters = ["and"].concat(QUERY.getFilters(query));
  if (filters && filters.length > 1) {
    return [
      t`Filtered by `,
      getFilterClauseDescription(tableMetadata, filters, options),
    ];
  }
}

export function getFilterClauseDescription(tableMetadata, filter, options) {
  if (filter[0] === "and" || filter[0] === "or") {
    const clauses = filter
      .slice(1)
      .map(f => getFilterClauseDescription(tableMetadata, f, options));
    return conjunctList(clauses, filter[0].toLowerCase());
  } else if (filter[0] === "segment") {
    const segment = _.findWhere(tableMetadata.segments, { id: filter[1] });
    const name = segment ? segment.name : "[Unknown Segment]";
    return options.jsx ? (
      <span className="text-purple text-bold">{name}</span>
    ) : (
      name
    );
  } else {
    return getFieldName(tableMetadata, filter[1], options);
  }
}

export function getOrderByDescription(tableMetadata, query, options) {
  const orderBy = query["order-by"];
  if (orderBy && orderBy.length > 0) {
    return [
      t`Sorted by `,
      joinList(
        orderBy.map(
          ([direction, field]) =>
            getFieldName(tableMetadata, field, options) +
            " " +
            (direction === "asc" ? "ascending" : "descending"),
        ),
        " and ",
      ),
    ];
  }
}

export function getLimitDescription(tableMetadata, { limit }) {
  if (limit != null) {
    return [limit, " ", inflection.inflect("row", limit)];
  }
}

export function generateQueryDescription(tableMetadata, query, options = {}) {
  if (!tableMetadata) {
    return "";
  }

  options = {
    jsx: false,
    sections: [
      "table",
      "aggregation",
      "breakout",
      "filter",
      "order-by",
      "limit",
    ],
    ...options,
  };

  const sectionFns = {
    table: getTableDescription,
    aggregation: getAggregationDescription,
    breakout: getBreakoutDescription,
    filter: getFilterDescription,
    "order-by": getOrderByDescription,
    limit: getLimitDescription,
  };

  // these array gymnastics are needed to support JSX formatting
  const sections = options.sections
    .map(section =>
      _.flatten(sectionFns[section](tableMetadata, query, options)).filter(
        s => !!s,
      ),
    )
    .filter(s => s && s.length > 0);

  const description = _.flatten(joinList(sections, ", "));
  if (options.jsx) {
    return <span>{description}</span>;
  } else {
    return description.join("");
  }
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
  const target = FIELD_REF.getFieldTarget(field, tableMetadata);
  const column = { ...target.field };
  if (FIELD_REF.isDatetimeField(field)) {
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

function joinList(list, joiner) {
  return _.flatten(
    list.map((l, i) => (i === list.length - 1 ? [l] : [l, joiner])),
    true,
  );
}

function conjunctList(list, conjunction) {
  switch (list.length) {
    case 0:
      return null;
    case 1:
      return list[0];
    case 2:
      return [list[0], " ", conjunction, " ", list[1]];
    default:
      return [
        list.slice(0, -1).join(", "),
        ", ",
        conjunction,
        " ",
        list[list.length - 1],
      ];
  }
}
