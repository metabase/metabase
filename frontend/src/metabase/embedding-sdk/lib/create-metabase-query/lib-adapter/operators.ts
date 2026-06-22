import { P, isMatching } from "ts-pattern";

import type {
  BooleanFilterOperator,
  DefaultFilterOperator,
  NumberFilterOperator,
  SpecificDateFilterOperator,
  StringFilterOperator,
} from "metabase-lib";

import type { FilterOperator } from "../input-types";

export const isDefaultFilterOperator: (
  operator: FilterOperator,
) => operator is DefaultFilterOperator = isMatching(
  P.union("is-null", "not-null"),
);

export const isNumberFilterOperator: (
  operator: FilterOperator,
) => operator is NumberFilterOperator = isMatching(
  P.union("=", "!=", ">", "<", "between", ">=", "<=", "is-null", "not-null"),
);

export const isBooleanFilterOperator: (
  operator: FilterOperator,
) => operator is BooleanFilterOperator = isMatching(
  P.union("=", "is-null", "not-null"),
);

export const isSpecificDateFilterOperator: (
  operator: FilterOperator,
) => operator is SpecificDateFilterOperator = isMatching(
  P.union("=", ">", "<", "between"),
);

export const isStringFilterOperator: (
  operator: FilterOperator,
) => operator is StringFilterOperator = isMatching(
  P.union(
    "=",
    "!=",
    "contains",
    "does-not-contain",
    "is-empty",
    "not-empty",
    "starts-with",
    "ends-with",
  ),
);
