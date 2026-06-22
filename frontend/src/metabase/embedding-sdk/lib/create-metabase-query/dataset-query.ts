import {
  getTableDatabaseIdFromQuery,
  getTableIdFromQuery,
} from "embedding-sdk-shared/lib/create-metabase-query/query-accessors";
import type { StructuredDatasetQuery } from "metabase-types/api";

import type { MetricQueryInput, TableQueryInput } from "./input-types";
import {
  buildMetricDatasetQueryFromSchema,
  buildTableDatasetQueryFromSchema,
} from "./lib-adapter/builder";
import {
  getTableFromSchema,
  hasMetricFromSchema,
  hasTableFromSchema,
  isMetricQueryInput,
} from "./query-utils";
import { buildTableDatasetQuery } from "./table-query-builder";
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
    if (hasMetricFromSchema(query)) {
      throw new Error(
        "Generated metric query could not be converted to a dataset query.",
      );
    }

    throw new Error(
      "Metric query object creation requires a generated metric schema.",
    );
  }

  if (hasTableFromSchema(query)) {
    throw new Error(
      "Generated table query could not be converted to a dataset query.",
    );
  }

  const databaseId = getTableDatabaseIdFromQuery(query as TableQueryInput);

  if (databaseId == null) {
    return buildTableDatasetQuery(
      query as TableQueryInput,
    ) as StructuredDatasetQuery;
  }

  return {
    ...buildTableDatasetQuery(query as TableQueryInput),
    database: Number(databaseId),
  };
};

function buildValidatedTableDatasetQueryFromSchema(
  query: TableQueryInput,
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

  return buildTableDatasetQueryFromSchema(query, table);
}

function buildValidatedMetricDatasetQueryFromSchema(
  query: MetricQueryInput,
): StructuredDatasetQuery | null {
  validateMetricTableScopedInputs(query);
  validateMetricGeneratedDimensions(query);

  return buildMetricDatasetQueryFromSchema(query);
}
