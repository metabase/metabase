import type { StructuredDatasetQuery } from "metabase-types/api";

import type { TableSchema } from "../data-schema";

import {
  getMetricDatabaseId,
  getMetricId,
  getMetricSourceTableId,
  getTableDatabaseId,
  getTableId,
} from "./guards";
import {
  applyAggregations,
  applyBreakouts,
  applyFilters,
  applyMetricMeasures,
  buildLibMetricDatasetFilter,
  buildLibTableFilter,
} from "./metabase-lib-query-clauses";
import { Lib } from "./metabase-lib-query-lib";
import {
  createLibQuery,
  createMetricMetadata,
  createTableMetadata,
} from "./metabase-lib-query-metadata";
import {
  normalizeDatasetQuery,
  normalizeMetricAggregations,
} from "./metabase-lib-query-normalization";
import { buildMetricDatasetQuery } from "./metric-query-builder";
import type { MetricQueryRuntime, TableQueryRuntime } from "./runtime-types";
import { buildTableDatasetQuery } from "./table-query-builder";
import {
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

  const databaseId = getTableDatabaseId(query);
  const tableId = getTableId(query);

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
  );
}

export function buildMetricDatasetQueryWithMetabaseLib(
  query: MetricQueryRuntime,
): StructuredDatasetQuery | null {
  validateMetricTableScopedInputs(query);

  const metricId = getMetricId(query);
  const databaseId = getMetricDatabaseId(query);
  const sourceTableId = getMetricSourceTableId(query);

  if (metricId == null || databaseId == null || sourceTableId == null) {
    return null;
  }

  const metadata = createMetricMetadata(query, Number(databaseId));
  let libQuery = createLibQuery(
    metadata,
    Number(databaseId),
    Number(sourceTableId),
  );

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

  return addMetricAggregation(
    normalizeMetricAggregations(
      normalizeDatasetQuery(
        Lib.toLegacyQuery(queryWithBreakouts) as StructuredDatasetQuery,
      ),
    ),
    Number(metricId),
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

  if ("metric" in query || "metricId" in query) {
    return buildMetricDatasetQuery(query as MetricQueryRuntime);
  }

  const databaseId = getTableDatabaseId(query as TableQueryRuntime);

  if (databaseId == null) {
    throw new Error(
      "Query creation requires a generated table schema, generated metric schema, or databaseId.",
    );
  }

  return {
    ...buildTableDatasetQuery(query as TableQueryRuntime),
    database: Number(databaseId),
  };
}

function getGeneratedTable(query: TableQueryRuntime): TableSchema | null {
  return typeof query.table === "object" && query.table != null
    ? (query.table as TableSchema)
    : null;
}

function addMetricAggregation(
  datasetQuery: StructuredDatasetQuery,
  metricId: number,
): StructuredDatasetQuery {
  return {
    ...datasetQuery,
    query: {
      ...datasetQuery.query,
      aggregation: [
        ["metric", metricId],
        ...(datasetQuery.query.aggregation ?? []),
      ],
    },
  };
}
