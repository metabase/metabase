import type { NumberFilterOperatorInfo, NumberPickerOperator } from "./types";

export const OPERATORS: Record<NumberPickerOperator, NumberFilterOperatorInfo> =
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
    ">": {
      operator: ">",
      valueCount: 1,
    },
    "<": {
      operator: "<",
      valueCount: 1,
    },
    between: {
      operator: "between",
      valueCount: 2,
    },
    "not-between": {
      operator: "not-between",
      valueCount: 2,
    },
    ">=": {
      operator: ">=",
      valueCount: 1,
    },
    "<=": {
      operator: "<=",
      valueCount: 1,
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
