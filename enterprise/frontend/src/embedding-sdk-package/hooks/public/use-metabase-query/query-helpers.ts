import {
  isNamedBreakout,
  isUnaryOperator,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";

import type { SchemaColumn } from "../data-schema";

import type {
  AggregationResultColumnName,
  BetweenFilterOperatorForDimension,
  BreakoutOptionsArgument,
  FilterForOperator,
  FilterLiteralValue,
  FilterOperator,
  MetabaseOrderByDirection,
  NamedBreakout,
  UnaryFilterOperatorForDimension,
  ValueFilterOperatorForDimension,
} from "./types";

// The dimension type params are `const` so a hand-built reference passed inline
// — `filter({ type: "column", name: "STATUS" }, "=", "paid")` — keeps its literal
// `type`/`name`/`jsType`. `useMetabaseQuery` infers its query type from the
// argument, so no contextual type reaches these calls to stop the widening, and a
// widened `type: string` no longer matches a column reference.

export function filter<
  const TDimension,
  TOperator extends ValueFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
  value: unknown,
): FilterForOperator<TDimension, TOperator>;

export function filter<
  const TDimension,
  TOperator extends BetweenFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
  values: readonly [unknown, unknown],
): FilterForOperator<TDimension, TOperator>;

export function filter<
  const TDimension,
  TOperator extends UnaryFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
): FilterForOperator<TDimension, TOperator>;

export function filter(
  dimension: unknown,
  operator: FilterOperator,
  value?: unknown,
): FilterForOperator<unknown, FilterOperator> {
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

export function breakout<const TDimension extends object>(
  dimension: TDimension,
): TDimension;

export function breakout<
  const TDimension extends object,
  const TName extends string,
>(
  dimension: TDimension,
  options: BreakoutOptionsArgument<TDimension> & { name: TName },
): NamedBreakout<TDimension & BreakoutOptionsArgument<TDimension>, TName>;

export function breakout<const TDimension extends object>(
  dimension: TDimension,
  options: BreakoutOptionsArgument<TDimension>,
): TDimension & BreakoutOptionsArgument<TDimension>;

export function breakout<TDimension extends object>(
  dimension: TDimension,
  options?: BreakoutOptionsArgument<TDimension> & { name?: string },
) {
  const column = {
    ...dimension,
    ...(options?.unit !== undefined ? { unit: options.unit } : undefined),
    ...(options?.binning !== undefined
      ? { binning: options.binning }
      : undefined),
  };

  return options?.name !== undefined
    ? { type: "breakout", name: options.name, column }
    : column;
}

export function orderBy<const TName extends string>(
  breakout: NamedBreakout<unknown, TName>,
  direction?: MetabaseOrderByDirection,
): { type: "column"; name: TName; direction?: MetabaseOrderByDirection };

export function orderBy<
  TAggregation extends { columns?: readonly SchemaColumn[] },
>(
  aggregation: TAggregation,
  direction?: MetabaseOrderByDirection,
): {
  type: "column";
  name: AggregationResultColumnName<TAggregation>;
  direction?: MetabaseOrderByDirection;
};

export function orderBy<const TDimension>(
  dimension: TDimension,
  direction?: MetabaseOrderByDirection,
): TDimension & { direction?: MetabaseOrderByDirection };

export function orderBy<TDimension>(
  dimension: TDimension,
  direction?: MetabaseOrderByDirection,
) {
  if (isNamedBreakout(dimension)) {
    return {
      type: "column",
      name: dimension.name,
      ...(direction ? { direction } : undefined),
    };
  }

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
