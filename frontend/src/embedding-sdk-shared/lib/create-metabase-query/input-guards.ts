import type {
  TestAggregationSpec,
  TestExpressionSpec,
  TestNamedAggregationSpec,
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
  savedQuestionEntityId?: string;
};

/**
 * The dynamic clauses applied on top of a static query. They become a stage of
 * their own, and a stage above the source sees only the previous stage's result
 * columns — so it takes the same clause set as a card stage.
 */
export type DynamicQueryInput = Pick<
  TestStageSpec,
  "breakouts" | "orderBys" | "limit"
> & {
  filters?: readonly TestExpressionSpec[];
  aggregations?: readonly TestExpressionSpec[];
  enabled?: boolean;
};

export type QuestionQueryInput = DynamicQueryInput & {
  source: QuestionSchema;
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

export const isNamedAggregation = (
  value: unknown,
): value is TestNamedAggregationSpec =>
  isObject(value) &&
  typeof value.name === "string" &&
  "value" in value &&
  !("type" in value);

export const unwrapNamedAggregation = (aggregation: TestAggregationSpec) =>
  isNamedAggregation(aggregation) ? aggregation.value : aggregation;

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
