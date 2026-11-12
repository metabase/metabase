import {
  getAggregationResultColumnDefaultName,
  getAggregationResultColumnJavaScriptType,
} from "embedding-sdk-shared/lib/create-metabase-query/result-columns";

import type { SchemaColumn, SchemaJavaScriptType } from "../data-schema";

import type {
  AggregationColumn,
  CountAggregation,
  CountAggregationSchema,
  FieldAggregation,
  FieldAggregationOperator,
  FieldAggregationSchema,
  NamedSavedAggregation,
  NumericAggregationDimension,
  OrderableAggregationDimension,
} from "./types";

type AggregationOptions<TName extends string> = {
  name: TName;
};

type AggregationDimension = {
  jsType?: SchemaJavaScriptType;
};

export function count(): CountAggregationSchema;
export function count<const TName extends string>(
  options: AggregationOptions<TName>,
): CountAggregationSchema<TName>;
export function count(
  options?: AggregationOptions<string>,
): CountAggregation & { columns: readonly [AggregationColumn] } {
  return {
    type: "operator",
    operator: "count",
    args: [],
    ...(options && { name: options.name }),
    columns: [
      {
        name: options?.name ?? getAggregationResultColumnDefaultName("count"),
        displayName: "Count",
        jsType: "number",
      },
    ],
  };
}

export function sum<const TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"sum", NumericAggregationDimension<TDimension>>;
export function sum<const TDimension, const TName extends string>(
  dimension: NumericAggregationDimension<TDimension>,
  options: AggregationOptions<TName>,
): FieldAggregationSchema<
  "sum",
  NumericAggregationDimension<TDimension>,
  TName
>;
export function sum(
  dimension: AggregationDimension,
  options?: AggregationOptions<string>,
) {
  return fieldAggregation("sum", "Sum", dimension, options);
}

export function avg<const TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"avg", NumericAggregationDimension<TDimension>>;
export function avg<const TDimension, const TName extends string>(
  dimension: NumericAggregationDimension<TDimension>,
  options: AggregationOptions<TName>,
): FieldAggregationSchema<
  "avg",
  NumericAggregationDimension<TDimension>,
  TName
>;
export function avg(
  dimension: AggregationDimension,
  options?: AggregationOptions<string>,
) {
  return fieldAggregation("avg", "Average", dimension, options);
}

export function median<const TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"median", NumericAggregationDimension<TDimension>>;
export function median<const TDimension, const TName extends string>(
  dimension: NumericAggregationDimension<TDimension>,
  options: AggregationOptions<TName>,
): FieldAggregationSchema<
  "median",
  NumericAggregationDimension<TDimension>,
  TName
>;
export function median(
  dimension: AggregationDimension,
  options?: AggregationOptions<string>,
) {
  return fieldAggregation("median", "Median", dimension, options);
}

export function distinct<const TDimension>(
  dimension: TDimension,
): FieldAggregationSchema<"distinct", TDimension>;
export function distinct<const TDimension, const TName extends string>(
  dimension: TDimension,
  options: AggregationOptions<TName>,
): FieldAggregationSchema<"distinct", TDimension, TName>;
export function distinct(
  dimension: AggregationDimension,
  options?: AggregationOptions<string>,
) {
  return fieldAggregation("distinct", "Distinct values", dimension, options);
}

export function min<const TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"min", OrderableAggregationDimension<TDimension>>;
export function min<const TDimension, const TName extends string>(
  dimension: OrderableAggregationDimension<TDimension>,
  options: AggregationOptions<TName>,
): FieldAggregationSchema<
  "min",
  OrderableAggregationDimension<TDimension>,
  TName
>;
export function min(
  dimension: AggregationDimension,
  options?: AggregationOptions<string>,
) {
  return fieldAggregation("min", "Minimum", dimension, options);
}

export function max<const TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"max", OrderableAggregationDimension<TDimension>>;
export function max<const TDimension, const TName extends string>(
  dimension: OrderableAggregationDimension<TDimension>,
  options: AggregationOptions<TName>,
): FieldAggregationSchema<
  "max",
  OrderableAggregationDimension<TDimension>,
  TName
>;
export function max(
  dimension: AggregationDimension,
  options?: AggregationOptions<string>,
) {
  return fieldAggregation("max", "Maximum", dimension, options);
}

function fieldAggregation(
  operator: FieldAggregationOperator,
  displayName: string,
  dimension: AggregationDimension,
  options: AggregationOptions<string> | undefined,
): FieldAggregation & { columns: readonly [AggregationColumn] } {
  return {
    type: "operator",
    operator,
    args: [dimension],
    ...(options && { name: options.name }),
    columns: [
      {
        name: options?.name ?? getAggregationResultColumnDefaultName(operator),
        displayName,
        jsType: getAggregationResultColumnJavaScriptType(
          operator,
          dimension.jsType,
        ),
      },
    ],
  };
}

type SavedAggregation<TType extends "measure" | "metric"> = {
  type: TType;
  columns?: readonly SchemaColumn[];
};

function namedSavedAggregation<TType extends "measure" | "metric">(
  aggregation: SavedAggregation<TType>,
  name: string,
): NamedSavedAggregation<SavedAggregation<TType>> {
  return {
    name,
    value: aggregation,
    columns: [{ ...aggregation.columns?.[0], name }],
  };
}

export function measure<const TMeasure extends SavedAggregation<"measure">>(
  measure: TMeasure,
): TMeasure;
export function measure<
  const TMeasure extends SavedAggregation<"measure">,
  const TName extends string,
>(
  measure: TMeasure,
  options: AggregationOptions<TName>,
): NamedSavedAggregation<TMeasure, TName>;
export function measure(
  measure: SavedAggregation<"measure">,
  options?: AggregationOptions<string>,
) {
  return options ? namedSavedAggregation(measure, options.name) : measure;
}

export function metric<const TMetric extends SavedAggregation<"metric">>(
  metric: TMetric,
): TMetric;
export function metric<
  const TMetric extends SavedAggregation<"metric">,
  const TName extends string,
>(
  metric: TMetric,
  options: AggregationOptions<TName>,
): NamedSavedAggregation<TMetric, TName>;
export function metric(
  metric: SavedAggregation<"metric">,
  options?: AggregationOptions<string>,
) {
  return options ? namedSavedAggregation(metric, options.name) : metric;
}

export const aggregations = {
  avg,
  count,
  distinct,
  max,
  median,
  measure,
  metric,
  min,
  sum,
} as const;
