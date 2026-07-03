import type {
  MetricSchema,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { TestStageWithSourceSpec } from "metabase-types/api";

export type TableQueryInput = Omit<TestStageWithSourceSpec, "source"> & {
  source: TableSchema;
  limit?: number;
  enabled?: boolean;
};

export type MetricQueryInput = Omit<
  TestStageWithSourceSpec,
  "fields" | "source"
> & {
  source: MetricSchema;
  fields?: never;
  limit?: number;
  enabled?: boolean;
};

export type QueryInput = TableQueryInput | MetricQueryInput;
