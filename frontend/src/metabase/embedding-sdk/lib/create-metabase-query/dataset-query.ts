import {
  getTableDatabaseIdFromQuery,
  getTableIdFromQuery,
} from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type { StructuredDatasetQuery } from "metabase-types/api";

import {
  buildMetricDatasetQueryWithMetabaseLib,
  buildTableDatasetQueryWithMetabaseLib,
} from "./lib-adapter/builder";
import {
  getTableFromSchema,
  hasMetricFromSchema,
  hasTableFromSchema,
  isMetricQueryRuntime,
} from "./query-utils";
import type { MetricQueryRuntime, TableQueryRuntime } from "./runtime-types";
import { buildTableDatasetQuery } from "./table-query-builder";
import {
  validateMetricGeneratedDimensions,
  validateMetricTableScopedInputs,
  validateTableScopedInputs,
} from "./validation";

export function buildDatasetQueryWithMetabaseLib(
  query: TableQueryRuntime | MetricQueryRuntime,
): StructuredDatasetQuery {
  const datasetQuery = isMetricQueryRuntime(query)
    ? buildMetricDatasetQueryFromSchema(query)
    : buildTableDatasetQueryFromSchema(query);

  if (datasetQuery) {
    return datasetQuery;
  }

  if (isMetricQueryRuntime(query)) {
    if (hasMetricFromSchema(query)) {
      throw new Error(
        "Generated metric query could not be built with metabase-lib.",
      );
    }

    throw new Error(
      "Metric query object creation requires a generated metric schema.",
    );
  }

  if (hasTableFromSchema(query)) {
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

function buildTableDatasetQueryFromSchema(
  query: TableQueryRuntime,
): StructuredDatasetQuery | null {
  const table = getTableFromSchema(query);

  if (!table) {
    return null;
  }

  const tableId = getTableIdFromQuery(query);

  if (tableId == null) {
    return null;
  }

  validateTableScopedInputs({
    allowedTableIds: [Number(tableId)],
    filters: query.filters,
    measures: query.aggregations ?? query.measures,
    context: "Table query",
  });

  return buildTableDatasetQueryWithMetabaseLib(query, table);
}

function buildMetricDatasetQueryFromSchema(
  query: MetricQueryRuntime,
): StructuredDatasetQuery | null {
  validateMetricTableScopedInputs(query);
  validateMetricGeneratedDimensions(query);

  return buildMetricDatasetQueryWithMetabaseLib(query);
}
