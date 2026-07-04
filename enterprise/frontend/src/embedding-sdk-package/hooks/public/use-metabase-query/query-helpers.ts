import { isUnaryOperator } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";

import type { SchemaColumn } from "../data-schema";

import type {
  BetweenFilterOperatorForDimension,
  BinningOptions,
  BreakoutOptionsArgument,
  FilterLiteralValue,
  FilterOperator,
  MetabaseDimensionFilterForOperator,
  OrderByDirection,
  UnaryFilterOperatorForDimension,
  ValueFilterOperatorForDimension,
} from "./types";

export function filter<
  TDimension,
  TOperator extends ValueFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
  value: unknown,
): MetabaseDimensionFilterForOperator<TDimension, TOperator>;

export function filter<
  TDimension,
  TOperator extends BetweenFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
  values: readonly [unknown, unknown],
): MetabaseDimensionFilterForOperator<TDimension, TOperator>;

export function filter<
  TDimension,
  TOperator extends UnaryFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
): MetabaseDimensionFilterForOperator<TDimension, TOperator>;

export function filter(
  dimension: unknown,
  operator: FilterOperator,
  value?: unknown,
): MetabaseDimensionFilterForOperator<unknown, FilterOperator> {
  if (operator === "between") {
    const [min, max] = value as readonly unknown[];

    return {
      type: "operator",
      operator,
      args: [
        dimension,
        { type: "literal", value: min as FilterLiteralValue },
        { type: "literal", value: max as FilterLiteralValue },
      ],
    };
  }

  if (isUnaryOperator(operator)) {
    return { type: "operator", operator, args: [dimension] };
  }

  return {
    type: "operator",
    operator,
    args: [dimension, { type: "literal", value: value as FilterLiteralValue }],
  };
}

export function breakout<TDimension>(dimension: TDimension): TDimension;

export function breakout<TDimension>(
  dimension: TDimension,
  options: BreakoutOptionsArgument<TDimension>,
): TDimension & BreakoutOptionsArgument<TDimension>;

export function breakout<TDimension>(
  dimension: TDimension,
  options?: BreakoutOptionsArgument<TDimension>,
) {
  return {
    ...(dimension as object),
    unit: options && "unit" in options ? options.unit : undefined,
    ...getBinningOptions(options),
  };
}

export function orderBy<
  TAggregation extends { columns?: readonly SchemaColumn[] },
>(
  aggregation: TAggregation,
  direction?: OrderByDirection,
): SchemaColumn & { type: "column"; direction?: OrderByDirection };

export function orderBy<TDimension>(
  dimension: TDimension,
  direction?: OrderByDirection,
): TDimension & { direction?: OrderByDirection };

export function orderBy<TDimension>(
  dimension: TDimension,
  direction: OrderByDirection | undefined,
  options: BreakoutOptionsArgument<TDimension>,
): TDimension & {
  direction?: OrderByDirection;
} & BreakoutOptionsArgument<TDimension>;

export function orderBy<TDimension>(
  dimension: TDimension,
  direction?: OrderByDirection,
  options?: BreakoutOptionsArgument<TDimension>,
) {
  const aggregationColumn = getAggregationResultColumn(dimension);

  if (aggregationColumn) {
    return {
      type: "column",
      name: aggregationColumn.name,
      ...(direction ? { direction } : undefined),
    };
  }

  // Do not pass the display name. It narrows the lookup and causes "No column found" errors.
  // The orderable column’s display name can be different from the schema field’s display name.
  const { displayName: _displayName, ...orderableDimension } = dimension as {
    displayName?: unknown;
  } & object;

  return {
    ...orderableDimension,
    ...(direction ? { direction } : undefined),
    unit: options && "unit" in options ? options.unit : undefined,
    ...getBinningOptions(options),
  };
}

function getAggregationResultColumn(value: unknown): SchemaColumn | undefined {
  if (value == null || typeof value !== "object") {
    return undefined;
  }

  const columns = (value as { columns?: unknown }).columns;

  if (!Array.isArray(columns)) {
    return undefined;
  }

  const [column] = columns;

  if (
    column == null ||
    typeof column !== "object" ||
    typeof (column as { name?: unknown }).name !== "string"
  ) {
    return undefined;
  }

  return column as SchemaColumn;
}

function getBinningOptions(
  options:
    | {
        binning?: BinningOptions;
        bins?: number | "auto";
        binWidth?: number | "auto";
      }
    | undefined,
) {
  if (!options) {
    return undefined;
  }

  if ("bins" in options && options.bins != null) {
    return { bins: options.bins };
  }

  if ("binWidth" in options && options.binWidth != null) {
    return { binWidth: options.binWidth };
  }

  if (options.binning?.strategy === "num-bins") {
    return { bins: options.binning["num-bins"] };
  }

  if (options.binning?.strategy === "bin-width") {
    return { binWidth: options.binning["bin-width"] };
  }

  if (options.binning?.strategy === "default") {
    return { bins: "auto" as const };
  }

  return undefined;
}
