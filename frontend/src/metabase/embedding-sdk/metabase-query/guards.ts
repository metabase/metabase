import { getMetricId, getTableId } from "./accessors";
import type {
  CountAggregationRuntime,
  DimensionFilterRuntime,
  FieldAggregationRuntime,
  MeasureReferenceRuntime,
  MetabaseQueryRuntime,
  MetricQueryRuntime,
  QuestionQueryRuntime,
  SegmentReferenceRuntime,
  TableQueryRuntime,
} from "./runtime-types";
import type { FieldSchema } from "./schema";

export const isQuestionQuery = (
  query: MetabaseQueryRuntime,
): query is QuestionQueryRuntime => query.questionId != null;

export const isTableQuery = (
  query: MetabaseQueryRuntime,
): query is TableQueryRuntime => getTableId(query) != null;

export const isMetricQuery = (
  query: MetabaseQueryRuntime,
): query is MetricQueryRuntime => getMetricId(query) != null;

export const isUnaryOperator = (operator: string) =>
  operator === "is-empty" ||
  operator === "not-empty" ||
  operator === "is-null" ||
  operator === "not-null";

export const isDimensionFilter = (
  value: unknown,
): value is DimensionFilterRuntime =>
  typeof value === "object" && value != null && "dimension" in value;

export const isTableDimensionFilter = (
  value: unknown,
): value is DimensionFilterRuntime & { dimension: FieldSchema } =>
  isDimensionFilter(value) && isTableFieldSchema(value.dimension);

export const isSegmentSchema = (
  value: unknown,
): value is SegmentReferenceRuntime =>
  typeof value === "object" &&
  value != null &&
  "kind" in value &&
  value.kind === "segment";

export const isMeasureSchema = (
  value: unknown,
): value is MeasureReferenceRuntime =>
  typeof value === "object" &&
  value != null &&
  "kind" in value &&
  value.kind === "measure";

export const isCountAggregation = (
  value: unknown,
): value is CountAggregationRuntime =>
  typeof value === "object" &&
  value != null &&
  "type" in value &&
  value.type === "count";

export const isFieldAggregation = (
  value: unknown,
): value is FieldAggregationRuntime =>
  typeof value === "object" &&
  value != null &&
  "type" in value &&
  "dimension" in value &&
  (value.type === "sum" ||
    value.type === "avg" ||
    value.type === "median" ||
    value.type === "distinct" ||
    value.type === "min" ||
    value.type === "max");

export const isFieldSchema = (value: unknown): value is FieldSchema =>
  isTableFieldSchema(value);

export function isTableFieldSchema(value: unknown): value is FieldSchema {
  if (typeof value !== "object" || value == null || "metricId" in value) {
    return false;
  }

  const field = value as Record<string, unknown>;

  return (
    typeof field.name === "string" &&
    (typeof field.fieldId === "number" ||
      typeof field.id === "number" ||
      typeof field.id === "string")
  );
}
