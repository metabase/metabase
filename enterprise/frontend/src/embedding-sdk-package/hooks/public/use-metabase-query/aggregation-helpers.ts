import type { SchemaJavaScriptType } from "../data-schema";

import type {
  CountAggregationSchema,
  FieldAggregationOperator,
  FieldAggregationSchema,
  NumericAggregationDimension,
  OrderableAggregationDimension,
} from "./types";

type AggregationOptions<TName extends string> = {
  name: TName;
};

export function count(): CountAggregationSchema;
export function count<const TName extends string>(
  options: AggregationOptions<TName>,
): CountAggregationSchema<TName>;
export function count(
  options?: AggregationOptions<string>,
): CountAggregationSchema<string> {
  return {
    type: "operator",
    operator: "count",
    args: [],
    ...(options && { name: options.name }),
    columns: [
      {
        name: options?.name ?? "count",
        displayName: "Count",
        jsType: "number",
      },
    ],
  };
}

export const sum = <TDimension, const TName extends string = "sum">(
  dimension: NumericAggregationDimension<TDimension>,
  options?: AggregationOptions<TName>,
): FieldAggregationSchema<
  "sum",
  NumericAggregationDimension<TDimension>,
  "number",
  NoInfer<TName>
> => fieldAggregation("sum", "Sum", dimension, options);

export const avg = <TDimension, const TName extends string = "avg">(
  dimension: NumericAggregationDimension<TDimension>,
  options?: AggregationOptions<TName>,
): FieldAggregationSchema<
  "avg",
  NumericAggregationDimension<TDimension>,
  "number",
  NoInfer<TName>
> => fieldAggregation("avg", "Average", dimension, options);

export const median = <TDimension, const TName extends string = "median">(
  dimension: NumericAggregationDimension<TDimension>,
  options?: AggregationOptions<TName>,
): FieldAggregationSchema<
  "median",
  NumericAggregationDimension<TDimension>,
  "number",
  NoInfer<TName>
> => fieldAggregation("median", "Median", dimension, options);

export const distinct = <TDimension, const TName extends string = "count">(
  dimension: TDimension,
  options?: AggregationOptions<TName>,
): FieldAggregationSchema<"distinct", TDimension, "number", NoInfer<TName>> =>
  fieldAggregation("distinct", "Distinct values", dimension, options);

export const min = <TDimension, const TName extends string = "min">(
  dimension: OrderableAggregationDimension<TDimension>,
  options?: AggregationOptions<TName>,
): FieldAggregationSchema<
  "min",
  OrderableAggregationDimension<TDimension>,
  "number",
  NoInfer<TName>
> => fieldAggregation("min", "Minimum", dimension, options);

export const max = <TDimension, const TName extends string = "max">(
  dimension: OrderableAggregationDimension<TDimension>,
  options?: AggregationOptions<TName>,
): FieldAggregationSchema<
  "max",
  OrderableAggregationDimension<TDimension>,
  "number",
  NoInfer<TName>
> => fieldAggregation("max", "Maximum", dimension, options);

const fieldAggregation = <
  TOperator extends FieldAggregationOperator,
  TDimension,
  TName extends string,
>(
  type: TOperator,
  displayName: string,
  dimension: TDimension,
  options: AggregationOptions<TName> | undefined,
): FieldAggregationSchema<TOperator, TDimension, "number", TName> =>
  // The column's `name`/`jsType` are computed at runtime (`string` /
  // `SchemaJavaScriptType`), while the schema type states them as the literals
  // derived from `TName` and `TOperator` — TS can't connect the two.
  ({
    type: "operator",
    operator: type,
    args: [dimension],
    ...(options && { name: options.name }),
    columns: [
      {
        name: options?.name ?? getFieldAggregationColumnName(type),
        displayName,
        jsType: getFieldAggregationColumnJavaScriptType(type, dimension),
      },
    ],
  }) as unknown as FieldAggregationSchema<
    TOperator,
    TDimension,
    "number",
    TName
  >;

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

  if (
    dimension == null ||
    typeof dimension !== "object" ||
    !("jsType" in dimension)
  ) {
    return "number";
  }

  const { jsType } = dimension;

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
