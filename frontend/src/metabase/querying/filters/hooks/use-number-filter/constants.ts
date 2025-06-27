import type * as Lib from "metabase-lib";

import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<
  Lib.NumberFilterOperator,
  OperatorOption
> = {
  "=": {
    operator: "=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  "!=": {
    operator: "!=",
    valueCount: 1,
    hasMultipleValues: true,
  },
  between: {
    operator: "between",
    valueCount: 2,
    name: "Range",
  },
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};
