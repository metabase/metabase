import type { BooleanFilterValue } from "metabase/querying/common/types";
import * as LibMetric from "metabase-lib/metric";

export function getFilterValue(
  definition: LibMetric.MetricDefinition,
  filterClause?: LibMetric.FilterClause,
): BooleanFilterValue {
  if (!filterClause) {
    return "true";
  }

  const filterParts = LibMetric.booleanFilterParts(definition, filterClause);
  if (!filterParts) {
    return "true";
  }

  if (filterParts.operator === "=") {
    return filterParts.values[0] ? "true" : "false";
  } else {
    return filterParts.operator;
  }
}

export function getFilterClause(
  dimension: LibMetric.DimensionMetadata,
  value: BooleanFilterValue,
): LibMetric.FilterClause {
  switch (value) {
    case "true":
      return LibMetric.booleanFilterClause({
        operator: "=",
        dimension,
        values: [true],
      });
    case "false":
      return LibMetric.booleanFilterClause({
        operator: "=",
        dimension,
        values: [false],
      });
    case "is-null":
      return LibMetric.booleanFilterClause({
        operator: "is-null",
        dimension,
        values: [],
      });
    case "not-null":
      return LibMetric.booleanFilterClause({
        operator: "not-null",
        dimension,
        values: [],
      });
  }
}
