import type { OperatorOption, UiNumberFilterOperator } from "./types";

export const OPERATOR_OPTIONS: Record<UiNumberFilterOperator, OperatorOption> =
  {
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
