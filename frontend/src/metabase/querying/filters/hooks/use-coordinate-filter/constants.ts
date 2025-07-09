import type { OperatorOption, UiCoordinateFilterOperator } from "./types";

export const OPERATOR_OPTIONS: Record<
  UiCoordinateFilterOperator,
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
  inside: {
    operator: "inside",
    valueCount: 4,
  },
  between: {
    operator: "between",
    valueCount: 2,
    name: "Range",
  },
};
