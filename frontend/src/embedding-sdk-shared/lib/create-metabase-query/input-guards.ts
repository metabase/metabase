import { isObject } from "metabase-types/guards";

import type { MetricSchema, TableSchema } from "./schema";

export type TableInput = { source?: TableSchema };
export type MetricInput = { source?: MetricSchema };
export type QueryInput = TableInput | MetricInput;

export const isTableInput = (input: unknown): input is TableInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "table";

export const isMetricInput = (input: unknown): input is MetricInput =>
  isObject(input) && "source" in input && isMetricReference(input.source);

export const isMetricReference = (value: unknown): value is MetricSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "metric";

export const isQueryInput = (input: unknown): input is QueryInput =>
  isTableInput(input) || isMetricInput(input);

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";
