import { getTableIdFromQuery } from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  StructuredDatasetQuery,
} from "metabase-types/api";

import {
  isCountAggregation,
  isDimensionFilter,
  isFieldAggregation,
  isMeasureSchema,
  isSegmentSchema,
  isUnaryOperator,
} from "./guards";
import type { DimensionFilterInput, TableQueryInput } from "./input-types";
import { getFieldId, normalizeBreakout } from "./query-utils";
import { validateTableScopedInputs } from "./validation";

export function buildTableDatasetQuery(
  query: TableQueryInput,
): Omit<StructuredDatasetQuery, "database"> {
  const tableId = getTableIdFromQuery(query);

  if (tableId == null) {
    throw new Error(
      "Table query requires a generated table schema or tableId.",
    );
  }

  validateTableScopedInputs({
    allowedTableIds: [Number(tableId)],
    filters: query.filters,
    measures: query.aggregations ?? query.measures,
    context: "Table query",
  });

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": Number(tableId),
  };

  const filters = query.filters?.map(buildTableFilter).filter(Boolean);
  const aggregations = buildTableAggregationClauses(query);
  const breakouts = query.breakouts?.map(buildTableBreakout).filter(Boolean);

  if (filters?.length === 1) {
    mbql.filter = filters[0] as Filter;
  } else if (filters && filters.length > 1) {
    mbql.filter = ["and", ...(filters as Filter[])];
  }

  if (aggregations.length > 0) {
    mbql.aggregation = aggregations;
  }

  if (breakouts?.length) {
    mbql.breakout = breakouts;
  }

  return {
    type: "query",
    query: mbql,
    parameters: [],
  };
}

function buildTableFilter(filter: unknown) {
  if (isSegmentSchema(filter)) {
    return ["segment", filter.id];
  }

  if (isDimensionFilter(filter)) {
    return buildFieldFilterClause(filter);
  }

  return null;
}

function buildTableAggregationClauses(query: TableQueryInput): Aggregation[] {
  const aggregations = query.aggregations ?? query.measures;
  const clauses = aggregations?.flatMap((aggregation) => {
    const clause = buildAggregationClause(aggregation);

    return clause ? [clause] : [];
  });

  if (clauses?.length) {
    return clauses;
  }

  return query.breakouts?.length ? [["count"] as Aggregation] : [];
}

function buildAggregationClause(aggregation: unknown): Aggregation | null {
  if (isCountAggregation(aggregation)) {
    return ["count"] as Aggregation;
  }

  if (isFieldAggregation(aggregation)) {
    return [
      aggregation.type,
      buildFieldReference(aggregation.dimension),
    ] as Aggregation;
  }

  if (!isMeasureSchema(aggregation)) {
    return null;
  }

  return ["measure", {}, aggregation.id] as Aggregation;
}

function buildTableBreakout(breakout: unknown): ConcreteFieldReference {
  const { dimension, options } = normalizeBreakout(breakout);

  if (dimension == null) {
    throw new Error("Table query breakouts must use generated field objects.");
  }

  return buildFieldReference(dimension, options) as ConcreteFieldReference;
}

function buildFieldFilterClause(filter: DimensionFilterInput) {
  const operator = filter.operator;
  const dimension = buildFieldReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, dimension];
  }

  return [operator, dimension, ...values];
}

function buildFieldReference(
  field: unknown,
  options: Record<string, unknown> = {},
): FieldReference {
  const fieldId = getFieldId(field);

  if (fieldId != null) {
    return ["field", fieldId, options] as FieldReference;
  }

  if (typeof field === "object" && field != null) {
    throw new Error(
      "Table query fields must use generated table field objects from schema.tables.*.fields.*.",
    );
  }

  return ["field", String(field), options] as FieldReference;
}
