import type { TableSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { TestStageWithSourceSpec } from "metabase-types/api";

export type TableQueryInput = Omit<TestStageWithSourceSpec, "source"> & {
  source: TableSchema;
  limit?: number;
  enabled?: boolean;
};
