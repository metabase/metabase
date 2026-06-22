import { isTableFieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import type { FieldSchema } from "embedding-sdk-shared/lib/create-metabase-query/schema";
import { isObject } from "metabase-types/guards";

import type {
  CountAggregationInput,
  DimensionFilterInput,
  FieldAggregationInput,
  MeasureReferenceInput,
  SegmentReferenceInput,
} from "./input-types";

export const isDimensionFilter = (
  value: unknown,
): value is DimensionFilterInput => isObject(value) && "dimension" in value;

export const isTableDimensionFilter = (
  value: unknown,
): value is DimensionFilterInput & { dimension: FieldSchema } =>
  isDimensionFilter(value) && isTableFieldSchema(value.dimension);

export const isSegmentSchema = (
  value: unknown,
): value is SegmentReferenceInput =>
  isObject(value) && "kind" in value && value.kind === "segment";

export const isMeasureSchema = (
  value: unknown,
): value is MeasureReferenceInput =>
  isObject(value) && "kind" in value && value.kind === "measure";

export const isCountAggregation = (
  value: unknown,
): value is CountAggregationInput =>
  isObject(value) && "type" in value && value.type === "count";

export const isFieldAggregation = (
  value: unknown,
): value is FieldAggregationInput =>
  isObject(value) &&
  "type" in value &&
  "dimension" in value &&
  (value.type === "sum" ||
    value.type === "avg" ||
    value.type === "median" ||
    value.type === "distinct" ||
    value.type === "min" ||
    value.type === "max");
