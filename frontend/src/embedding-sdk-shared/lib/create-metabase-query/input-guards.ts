import type { TestStageWithSourceSpec } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { MetricSchema, TableSchema } from "./schema";

export type TableQueryInput = Omit<TestStageWithSourceSpec, "source"> & {
  source: TableSchema;
  limit?: number;
  enabled?: boolean;
};

export const isTableInput = (input: unknown): input is TableQueryInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "table";

export const isMetricReference = (value: unknown): value is MetricSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "metric";

export const isQueryInput = (input: unknown): input is TableQueryInput =>
  isTableInput(input);

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";
