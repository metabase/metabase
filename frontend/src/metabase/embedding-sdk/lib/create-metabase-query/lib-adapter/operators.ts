import {
  DATE_PICKER_OPERATORS,
  SPECIFIC_DATE_PICKER_OPERATORS,
} from "metabase/querying/common/constants";
import type {
  BooleanFilterOperator,
  DefaultFilterOperator,
  NumberFilterOperator,
  SpecificDateFilterOperator,
  StringFilterOperator,
} from "metabase-lib";

import type { FilterOperator } from "../input-types";

const DEFAULT_FILTER_OPERATORS = ["is-null", "not-null"] as const;

const DATE_FILTER_OPERATORS = [
  ...DATE_PICKER_OPERATORS,

  // MBQL accepts this even if date picker doesn't expose this
  ">=",
  "<=",
] as const;

type SdkDateFilterOperator = (typeof DATE_FILTER_OPERATORS)[number];

const makeOperatorPredicate =
  <TOperator extends FilterOperator>(operators: readonly TOperator[]) =>
  (operator: FilterOperator): operator is TOperator =>
    operators.includes(operator as TOperator);

export const isDefaultFilterOperator: (
  op: FilterOperator,
) => op is DefaultFilterOperator = makeOperatorPredicate(
  DEFAULT_FILTER_OPERATORS,
);

export const isNumberFilterOperator: (
  op: FilterOperator,
) => op is NumberFilterOperator = makeOperatorPredicate([
  "=",
  "!=",
  ">",
  "<",
  "between",
  ">=",
  "<=",
  "is-null",
  "not-null",
]);

export const isBooleanFilterOperator: (
  op: FilterOperator,
) => op is BooleanFilterOperator = makeOperatorPredicate([
  "=",
  "is-null",
  "not-null",
]);

export const isSpecificDateFilterOperator: (
  op: FilterOperator,
) => op is SpecificDateFilterOperator = makeOperatorPredicate(
  SPECIFIC_DATE_PICKER_OPERATORS,
);

export const isDateFilterOperator: (
  op: FilterOperator,
) => op is SdkDateFilterOperator = makeOperatorPredicate(DATE_FILTER_OPERATORS);

export const isStringFilterOperator: (
  op: FilterOperator,
) => op is StringFilterOperator = makeOperatorPredicate([
  "=",
  "!=",
  "contains",
  "does-not-contain",
  "is-empty",
  "not-empty",
  "starts-with",
  "ends-with",
]);
