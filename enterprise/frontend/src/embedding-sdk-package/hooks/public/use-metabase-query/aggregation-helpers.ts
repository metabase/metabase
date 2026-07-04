import type {
  CountAggregationSchema,
  FieldAggregationOperator,
  FieldAggregationSchema,
  NumericAggregationDimension,
  OrderableAggregationDimension,
} from "./types";
import type { SchemaJavaScriptType } from "../data-schema";

export const count = (): CountAggregationSchema => ({
  type: "operator",
  operator: "count",
  args: [],
  columns: [{ name: "count", displayName: "Count", jsType: "number" }],
});

export const sum = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"sum", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("sum", "Sum", dimension);

export const avg = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"avg", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("avg", "Average", dimension);

export const median = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"median", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("median", "Median", dimension);

export const distinct = <TDimension>(
  dimension: TDimension,
): FieldAggregationSchema<"distinct", TDimension> =>
  fieldAggregation("distinct", "Distinct values", dimension);

export const min = <TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"min", OrderableAggregationDimension<TDimension>> =>
  fieldAggregation("min", "Minimum", dimension);

export const max = <TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"max", OrderableAggregationDimension<TDimension>> =>
  fieldAggregation("max", "Maximum", dimension);

const fieldAggregation = <
  TOperator extends FieldAggregationOperator,
  TDimension,
>(
  type: TOperator,
  displayName: string,
  dimension: TDimension,
): FieldAggregationSchema<TOperator, TDimension> =>
  ({
    type: "operator",
    operator: type,
    args: [dimension],
    columns: [
      {
        name: getFieldAggregationColumnName(type),
        displayName,
        jsType: getFieldAggregationColumnJavaScriptType(type, dimension),
      },
    ],
  }) as unknown as FieldAggregationSchema<TOperator, TDimension>;

const getFieldAggregationColumnName = (
  type: FieldAggregationOperator,
): string => (type === "distinct" ? "count" : type);

function getFieldAggregationColumnJavaScriptType(
  type: FieldAggregationOperator,
  dimension: unknown,
): SchemaJavaScriptType {
  if (type !== "min" && type !== "max") {
    return "number";
  }

  if (dimension == null || typeof dimension !== "object") {
    return "number";
  }

  const jsType = (dimension as { jsType?: unknown }).jsType;

  if (isOrderableJavaScriptType(jsType)) {
    return jsType;
  }

  return "number";
}

const isOrderableJavaScriptType = (
  value: unknown,
): value is Exclude<SchemaJavaScriptType, "unknown"> =>
  value === "string" ||
  value === "number" ||
  value === "boolean" ||
  value === "Date";

export const aggregations = {
  avg,
  count,
  distinct,
  max,
  median,
  min,
  sum,
} as const;
