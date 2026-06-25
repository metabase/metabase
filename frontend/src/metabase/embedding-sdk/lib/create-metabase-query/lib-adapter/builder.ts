import {
  getMetricDatabaseIdFromInput,
  getMetricIdFromInput,
  getMetricSourceIdFromInput,
  getTableDatabaseIdFromInput,
  getTableIdFromInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-accessors";
import type { TableSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { DatasetQuery } from "metabase-types/api";

import type { MetricQueryInput, TableQueryInput } from "../input-types";

import {
  applyAggregations,
  applyMetricAggregation,
  applyMetricMeasures,
} from "./aggregations";
import { applyBreakouts } from "./breakouts";
import {
  applyFilters,
  buildLibMetricFilter,
  buildLibTableFilter,
} from "./filters";
import { applyLimit } from "./limit";
import {
  createLibQuery,
  createMetricMetadata,
  createTableMetadata,
} from "./metadata";
import { applySorts } from "./sorts";

type QueryStep = (query: Query) => Query | null;

// Runs each step in order, short-circuiting to null as soon as a step fails.
function pipeQuery(query: Query, ...steps: QueryStep[]): Query | null {
  let current: Query | null = query;

  for (const step of steps) {
    if (current == null) {
      return null;
    }

    current = step(current);
  }

  return current;
}

export function buildTableDatasetQueryFromInput(
  input: TableQueryInput,
  table: TableSchema,
): DatasetQuery | null {
  const databaseId = getTableDatabaseIdFromInput(input);
  const tableId = getTableIdFromInput(input);

  if (databaseId == null || tableId == null) {
    return null;
  }

  const metadata = createTableMetadata(table, Number(databaseId), input);

  // Single source of truth for the table's aggregations, so the applied
  // aggregations and the sort-target lookup can't drift apart.
  const aggregations = getTableAggregations(input);

  const query = pipeQuery(
    createLibQuery(metadata, Number(databaseId), Number(tableId)),
    (q) => applyFilters(q, input.filters, buildLibTableFilter),
    (q) => applyAggregations(q, aggregations),
    (q) => applyBreakouts(q, input.breakouts),
    (q) => applySorts(q, input.sorts, aggregations),
    (q) => applyLimit(q, input.limit),
  );

  return query == null ? null : Lib.toJsQuery(query);
}

export function buildMetricDatasetQueryFromInput(
  input: MetricQueryInput,
): DatasetQuery | null {
  const metricId = getMetricIdFromInput(input);
  const databaseId = getMetricDatabaseIdFromInput(input);
  const sourceId = getMetricSourceIdFromInput(input);

  if (metricId == null || databaseId == null || sourceId == null) {
    return null;
  }

  const metadata = createMetricMetadata(input, Number(databaseId));

  // The metric aggregation is applied first, then the measures; `aggregations`
  // mirrors that order so a sort target can be matched to its aggregation index.
  const aggregations = getMetricAggregations(input);

  const query = pipeQuery(
    createLibQuery(metadata, Number(databaseId), sourceId),
    (q) => applyMetricAggregation(q, Number(metricId)),
    (q) => applyMetricMeasures(q, input.measures),
    (q) => applyFilters(q, input.filters, buildLibMetricFilter),
    (q) => applyBreakouts(q, input.breakouts),
    (q) => applySorts(q, input.sorts, aggregations),
    (q) => applyLimit(q, input.limit),
  );

  return query == null ? null : Lib.toJsQuery(query);
}

// `applyAggregations` adds a default count when there are breakouts but no
// explicit aggregations; this mirrors that so the applied aggregations and the
// sort-target lookup share one ordered list.
const DEFAULT_COUNT_AGGREGATION = { type: "count" };

function getTableAggregations(input: TableQueryInput): readonly unknown[] {
  const aggregations = input.aggregations ?? input.measures;

  if (aggregations?.length) {
    return aggregations;
  }

  return input.breakouts?.length ? [DEFAULT_COUNT_AGGREGATION] : [];
}

function getMetricAggregations(input: MetricQueryInput): readonly unknown[] {
  return [input.metric, ...(input.measures ?? [])];
}
