import React from "react";

import { t } from "ttag";
import _ from "underscore";
import inflection from "inflection";

import { stripId } from "metabase/lib/formatting";

import { FilterClause, MetricClause } from "./description.styled.tsx";

// NOTE: This doesn't support every MBQL clause, e.x. joins. It should also be moved to StructuredQuery.

export function formatField(fieldDef, options = {}) {
  const name = stripId(fieldDef && (fieldDef.display_name || fieldDef.name));
  return name;
}

// -----------------------------------------------------------------------------
// These functions use the `query_description` field returned by the Segment and
// Metric APIs. They're meant for cases where you do not have the full database
// metadata available, and the server side will generate a data structure
// containing all the applicable data for formatting a user-friendly description
// of a query.
//
// TODO: This is almost 100% duplicated with code in Question.ts, find a way to
// consolidate them
// -----------------------------------------------------------------------------

function formatTableDescription({ table }, options = {}) {
  return [inflection.pluralize(table)];
}

function formatAggregationDescription({ aggregation }, options = {}) {
  if (!aggregation || !aggregation.length) {
    return [];
  }

  return conjunctList(
    aggregation.map(agg => {
      switch (agg["type"]) {
        case "aggregation":
          return [agg["arg"]];
        case "metric":
          return [
            options.jsx ? (
              <MetricClause>{agg["arg"]}</MetricClause>
            ) : (
              agg["arg"]
            ),
          ];
        case "rows":
          return [t`Raw data`];
        case "count":
          return [t`Count`];
        case "cum-count":
          return [t`Cumulative count`];
        case "avg":
          return [t`Average of `, agg["arg"]];
        case "median":
          return [t`Median of `, agg["arg"]];
        case "distinct":
          return [t`Distinct values of `, agg["arg"]];
        case "stddev":
          return [t`Standard deviation of `, agg["arg"]];
        case "sum":
          return [t`Sum of `, agg["arg"]];
        case "cum-sum":
          return [t`Cumulative sum of `, agg["arg"]];
        case "max":
          return [t`Maximum of `, agg["arg"]];
        case "min":
          return [t`Minimum of `, agg["arg"]];
        default: {
          console.warn(
            "Unexpected aggregation type in formatAggregationDescription: ",
            agg["type"],
          );
          return null;
        }
      }
    }),
  );
}

function formatFilterDescription({ filter }, options = {}) {
  if (!filter || !filter.length) {
    return [];
  }

  return [
    t`Filtered by `,
    joinList(
      filter.map(f => {
        if (f["segment"] != null) {
          return options.jsx ? (
            <FilterClause>{f["segment"]}</FilterClause>
          ) : (
            f["segment"]
          );
        } else if (f["field"] != null) {
          return f["field"];
        }
      }),
      ", ",
    ),
  ];
}

export function formatQueryDescription(parts, options = {}) {
  if (!parts) {
    return "";
  }

  options = {
    jsx: false,
    sections: ["table", "aggregation", "filter"],
    ...options,
  };

  const sectionFns = {
    table: formatTableDescription,
    aggregation: formatAggregationDescription,
    filter: formatFilterDescription,
  };

  // these array gymnastics are needed to support JSX formatting
  const sections = (options.sections || [])
    .map(section =>
      _.flatten(sectionFns[section](parts, options)).filter(s => !!s),
    )
    .filter(s => s && s.length > 0);

  const description = _.flatten(joinList(sections, ", "));
  if (options.jsx) {
    return <span>{description}</span>;
  } else {
    return description.join("");
  }
}

export function joinList(list, joiner) {
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
