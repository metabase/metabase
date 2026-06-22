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

import type { MetricQueryInput, TableQueryInput } from "../input-types";

import {
  applyAggregations,
  applyMetricAggregation,
  applyMetricMeasures,
} from "./aggregations";
import { applyBreakouts } from "./breakouts";
import {
  applyFilters,
  buildLibMetricDatasetFilter,
  buildLibTableFilter,
} from "./filters";
import {
  createLibQuery,
  createMetricMetadata,
  createTableMetadata,
} from "./metadata";
import { normalizeDatasetQuery } from "./normalization";

export function buildTableDatasetQueryFromSchema(
  query: TableQueryInput,
  table: TableSchema,
): StructuredDatasetQuery | null {
  const databaseId = getTableDatabaseIdFromQuery(query);
  const tableId = getTableIdFromQuery(query);

  if (databaseId == null || tableId == null) {
    return null;
  }

  const metadata = createTableMetadata(table, Number(databaseId), query);
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

export function buildMetricDatasetQueryFromSchema(
  query: MetricQueryInput,
): StructuredDatasetQuery | null {
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
