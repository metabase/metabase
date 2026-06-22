import { getTableIdFromQuery } from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type { StructuredDatasetQuery } from "metabase-types/api";

import type { MetricQueryInput, TableQueryInput } from "./input-types";
import {
  buildMetricDatasetQueryFromSchema,
  buildTableDatasetQueryFromSchema,
} from "./lib-adapter/builder";
import { getTableFromInput, isMetricQueryInput } from "./query-utils";
import {
  validateMetricGeneratedDimensions,
  validateMetricTableScopedInputs,
  validateTableScopedInputs,
} from "./validation";

export type CreateMetabaseQuery = (
  query: TableQueryInput | MetricQueryInput,
) => StructuredDatasetQuery;

export const createMetabaseQuery: CreateMetabaseQuery = (
  query: TableQueryInput | MetricQueryInput,
) => {
  const datasetQuery = isMetricQueryInput(query)
    ? buildValidatedMetricDatasetQueryFromSchema(query)
    : buildValidatedTableDatasetQueryFromSchema(query);

  if (datasetQuery) {
    return datasetQuery;
  }

  if (isMetricQueryInput(query)) {
    throw new Error(
      "Metric query object creation requires a generated metric schema.",
    );
  }

  throw new Error(
    "Table query object creation requires a table reference with id and databaseId.",
  );
};

function buildValidatedTableDatasetQueryFromSchema(
  query: TableQueryInput,
): StructuredDatasetQuery | null {
  const table = getTableFromInput(query);

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

  return buildTableDatasetQueryFromSchema(query, table);
}

function buildValidatedMetricDatasetQueryFromSchema(
  query: MetricQueryInput,
): StructuredDatasetQuery | null {
  validateMetricTableScopedInputs(query);
  validateMetricGeneratedDimensions(query);

  return buildMetricDatasetQueryFromSchema(query);
}
