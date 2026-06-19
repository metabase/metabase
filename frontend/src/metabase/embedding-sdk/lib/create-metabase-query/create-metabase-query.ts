import type { StructuredDatasetQuery } from "metabase-types/api";

import { buildDatasetQueryWithMetabaseLib } from "./metabase-lib-query-builder";
import type { MetricQueryRuntime, TableQueryRuntime } from "./runtime-types";

export type CreateMetabaseQuery = (
  query: TableQueryRuntime | MetricQueryRuntime,
) => StructuredDatasetQuery;

export const createMetabaseQuery: CreateMetabaseQuery = (query) =>
  buildDatasetQueryWithMetabaseLib(query);
