import {
  getMetricDatabaseIdFromQuery,
  getMetricIdFromQuery,
  getMetricSourceIdFromQuery,
  getTableDatabaseIdFromQuery,
  getTableIdFromQuery,
} from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type { TableSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import * as Lib from "metabase-lib";
import type { StructuredDatasetQuery } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  applyAggregations,
  applyBreakouts,
  applyFilters,
  applyMetricAggregation,
  applyMetricMeasures,
  buildLibMetricDatasetFilter,
  buildLibTableFilter,
} from "./metabase-lib-query-clauses";
import {
  createLibQuery,
  createMetricMetadata,
  createTableMetadata,
} from "./metabase-lib-query-metadata";
import { normalizeDatasetQuery } from "./metabase-lib-query-normalization";
import type { MetricQueryRuntime, TableQueryRuntime } from "./runtime-types";
import { buildTableDatasetQuery } from "./table-query-builder";
import {
  validateMetricGeneratedDimensions,
  validateMetricTableScopedInputs,
  validateTableScopedInputs,
} from "./validation";

export function buildTableDatasetQueryWithMetabaseLib(
  query: TableQueryRuntime,
): StructuredDatasetQuery | null {
  const table = getGeneratedTable(query);

  if (!table) {
    return null;
  }

  const databaseId = getTableDatabaseIdFromQuery(query);
  const tableId = getTableIdFromQuery(query);

  if (databaseId == null || tableId == null) {
    return null;
  }

  validateTableScopedInputs({
    allowedTableIds: [Number(tableId)],
    filters: query.filters,
    measures: query.aggregations ?? query.measures,
    context: "Table query",
  });

  const metadata = createTableMetadata(table, Number(databaseId));
  let libQuery = createLibQuery(metadata, Number(databaseId), Number(tableId));

  const queryWithFilters = applyFilters(
    libQuery,
    query.filters,
    buildLibTableFilter,
  );

  if (!queryWithFilters) {
    return null;
  }

  libQuery = queryWithFilters;

  const queryWithAggregations = applyAggregations(
    libQuery,
    query.aggregations ?? query.measures,
    { addDefaultCount: Boolean(query.breakouts?.length) },
  );

  if (!queryWithAggregations) {
    return null;
  }

  libQuery = queryWithAggregations;

  const queryWithBreakouts = applyBreakouts(libQuery, query.breakouts);

  if (!queryWithBreakouts) {
    return null;
  }

  return normalizeDatasetQuery(
    Lib.toLegacyQuery(queryWithBreakouts) as StructuredDatasetQuery,
    query.breakouts,
  );
}

export function buildMetricDatasetQueryWithMetabaseLib(
  query: MetricQueryRuntime,
): StructuredDatasetQuery | null {
  validateMetricTableScopedInputs(query);
  validateMetricGeneratedDimensions(query);

  const metricId = getMetricIdFromQuery(query);
  const databaseId = getMetricDatabaseIdFromQuery(query);
  const sourceId = getMetricSourceIdFromQuery(query);

  if (metricId == null || databaseId == null || sourceId == null) {
    return null;
  }

  const metadata = createMetricMetadata(query, Number(databaseId));

  let libQuery = createLibQuery(metadata, Number(databaseId), sourceId);

  const queryWithMetric = applyMetricAggregation(libQuery, Number(metricId));

  if (!queryWithMetric) {
    return null;
  }

  libQuery = queryWithMetric;

  const queryWithMeasures = applyMetricMeasures(libQuery, query.measures);

  if (!queryWithMeasures) {
    return null;
  }

  libQuery = queryWithMeasures;

  const queryWithFilters = applyFilters(
    libQuery,
    query.filters,
    buildLibMetricDatasetFilter,
  );

  if (!queryWithFilters) {
    return null;
  }

  libQuery = queryWithFilters;

  const queryWithBreakouts = applyBreakouts(libQuery, query.breakouts);

  if (!queryWithBreakouts) {
    return null;
  }

  return normalizeDatasetQuery(
    Lib.toLegacyQuery(queryWithBreakouts) as StructuredDatasetQuery,
    query.breakouts,
  );
}

export function buildDatasetQueryWithMetabaseLib(
  query: TableQueryRuntime | MetricQueryRuntime,
): StructuredDatasetQuery {
  const datasetQuery =
    "metric" in query || "metricId" in query
      ? buildMetricDatasetQueryWithMetabaseLib(query as MetricQueryRuntime)
      : buildTableDatasetQueryWithMetabaseLib(query as TableQueryRuntime);

  if (datasetQuery) {
    return datasetQuery;
  }

  if (isMetricQueryRuntime(query)) {
    if (hasGeneratedMetric(query)) {
      throw new Error(
        "Generated metric query could not be built with metabase-lib.",
      );
    }

    throw new Error(
      "Metric query object creation requires a generated metric schema.",
    );
  }

  if (hasGeneratedTable(query)) {
    throw new Error(
      "Generated table query could not be built with metabase-lib.",
    );
  }

  const databaseId = getTableDatabaseIdFromQuery(query as TableQueryRuntime);

  if (databaseId == null) {
    return buildTableDatasetQuery(
      query as TableQueryRuntime,
    ) as StructuredDatasetQuery;
  }

  return {
    ...buildTableDatasetQuery(query as TableQueryRuntime),
    database: Number(databaseId),
  };
}

const getGeneratedTable = (query: TableQueryRuntime): TableSchema | null =>
  isObject(query.table) ? (query.table as TableSchema) : null;

const isMetricQueryRuntime = (
  query: TableQueryRuntime | MetricQueryRuntime,
): query is MetricQueryRuntime => "metric" in query || "metricId" in query;

const hasGeneratedMetric = (query: MetricQueryRuntime): boolean =>
  isObject(query.metric);

const hasGeneratedTable = (
  query: TableQueryRuntime | MetricQueryRuntime,
): query is TableQueryRuntime =>
  !isMetricQueryRuntime(query) && isObject(query.table);
