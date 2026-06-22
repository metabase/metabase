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
  buildLibMetricFilter,
  buildLibTableFilter,
} from "./filters";
import {
  createLibQuery,
  createMetricMetadata,
  createTableMetadata,
} from "./metadata";
import { normalizeDatasetQuery } from "./normalization";

export function buildTableDatasetQueryFromInput(
  input: TableQueryInput,
  table: TableSchema,
): StructuredDatasetQuery | null {
  const databaseId = getTableDatabaseIdFromQuery(input);
  const tableId = getTableIdFromQuery(input);

  if (databaseId == null || tableId == null) {
    return null;
  }

  const metadata = createTableMetadata(table, Number(databaseId), input);
  let libQuery = createLibQuery(metadata, Number(databaseId), Number(tableId));

  const queryWithFilters = applyFilters(
    libQuery,
    input.filters,
    buildLibTableFilter,
  );

  if (!queryWithFilters) {
    return null;
  }

  libQuery = queryWithFilters;

  const queryWithAggregations = applyAggregations(
    libQuery,
    input.aggregations ?? input.measures,
    { addDefaultCount: Boolean(input.breakouts?.length) },
  );

  if (!queryWithAggregations) {
    return null;
  }

  libQuery = queryWithAggregations;

  const queryWithBreakouts = applyBreakouts(libQuery, input.breakouts);

  if (!queryWithBreakouts) {
    return null;
  }

  return normalizeDatasetQuery(
    Lib.toLegacyQuery(queryWithBreakouts) as StructuredDatasetQuery,
    input.breakouts,
  );
}

export function buildMetricDatasetQueryFromInput(
  input: MetricQueryInput,
): StructuredDatasetQuery | null {
  const metricId = getMetricIdFromQuery(input);
  const databaseId = getMetricDatabaseIdFromQuery(input);
  const sourceId = getMetricSourceIdFromQuery(input);

  if (metricId == null || databaseId == null || sourceId == null) {
    return null;
  }

  const metadata = createMetricMetadata(input, Number(databaseId));
  let libQuery = createLibQuery(metadata, Number(databaseId), sourceId);

  const queryWithMetric = applyMetricAggregation(libQuery, Number(metricId));

  if (!queryWithMetric) {
    return null;
  }

  libQuery = queryWithMetric;

  const queryWithMeasures = applyMetricMeasures(libQuery, input.measures);

  if (!queryWithMeasures) {
    return null;
  }

  libQuery = queryWithMeasures;

  const queryWithFilters = applyFilters(
    libQuery,
    input.filters,
    buildLibMetricFilter,
  );

  if (!queryWithFilters) {
    return null;
  }

  libQuery = queryWithFilters;

  const queryWithBreakouts = applyBreakouts(libQuery, input.breakouts);

  if (!queryWithBreakouts) {
    return null;
  }

  return normalizeDatasetQuery(
    Lib.toLegacyQuery(queryWithBreakouts) as StructuredDatasetQuery,
    input.breakouts,
  );
}
