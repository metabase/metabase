import type {
  TestExpressionSpec,
  TestStageSpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type {
  MeasureSchema,
  MetricSchema,
  QuestionSchema,
  SegmentSchema,
  TableSchema,
} from "./schema";

export type TableQueryInput = Omit<TestStageWithSourceSpec, "source"> & {
  source: TableSchema;
  limit?: number;
  enabled?: boolean;
};

export type QuestionQueryInput = Pick<
  TestStageSpec,
  "breakouts" | "orderBys" | "limit"
> & {
  source: QuestionSchema;
  filters?: readonly TestExpressionSpec[];
  aggregations?: readonly TestExpressionSpec[];
  enabled?: boolean;
};

export type QueryInput = TableQueryInput | QuestionQueryInput;

export const isTableInput = (input: unknown): input is TableQueryInput =>
  isObject(input) && "source" in input && isTableReference(input.source);

export const isTableReference = (value: unknown): value is TableSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "table";

export const isMetricReference = (value: unknown): value is MetricSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "metric";

export const isSegmentReference = (value: unknown): value is SegmentSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "segment";

export const isMeasureReference = (value: unknown): value is MeasureSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "measure";

export const isQuestionInput = (input: unknown): input is QuestionQueryInput =>
  isObject(input) && "source" in input && isQuestionReference(input.source);

export const isQuestionReference = (value: unknown): value is QuestionSchema =>
  isObject(value) && typeof value.id === "number" && value.type === "card";

export const isQueryInput = (input: unknown): input is QueryInput =>
  isTableInput(input) || isQuestionInput(input);

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";
