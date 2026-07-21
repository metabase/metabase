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
    // The `between` overload takes a `[min, max]` tuple, but the implementation
    // signature shared by all overloads widens `value` to `unknown`.
    const [min, max] = value as readonly [unknown, unknown];

    return {
      type: "operator",
      operator,
      args: [dimension, toFilterLiteral(min), toFilterLiteral(max)],
    };
  }

  if (isUnaryOperator(operator)) {
    return { type: "operator", operator, args: [dimension] };
  }

  return {
    type: "operator",
    operator,
    args: [dimension, toFilterLiteral(value)],
  };
}

export function breakout<TDimension extends object>(
  dimension: TDimension,
): TDimension;

export function breakout<TDimension extends object>(
  dimension: TDimension,
  options: BreakoutOptionsArgument<TDimension>,
): TDimension & BreakoutOptionsArgument<TDimension>;

export function breakout<TDimension extends object>(
  dimension: TDimension,
  options?: BreakoutOptionsArgument<TDimension>,
) {
  return {
    ...dimension,
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
  if (value == null || typeof value !== "object" || !("columns" in value)) {
    return undefined;
  }

  const { columns } = value;

  if (!Array.isArray(columns)) {
    return undefined;
  }

  const [column] = columns;

  return isSchemaColumn(column) ? column : undefined;
}

function isSchemaColumn(value: unknown): value is SchemaColumn {
  return (
    value != null &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string"
  );
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

function toFilterLiteral(value: unknown): {
  type: "literal";
  value: FilterLiteralValue;
} {
  return {
    type: "literal",
    // The overloads accept the filter value as `unknown` (it is only constrained
    // by the operator), while the emitted filter types it as a literal value.
    value: value as FilterLiteralValue,
  };
}
