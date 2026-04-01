import type { TimeFilterOperatorInfo, TimePickerOperator } from "./types";

export const OPERATORS: Record<TimePickerOperator, TimeFilterOperatorInfo> = {
  "<": {
    operator: "<",
    valueCount: 1,
  },
  ">": {
    operator: ">",
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
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};
