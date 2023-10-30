import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<string, OperatorOption> = {
  "=": {
    operator: "=",
    valueCount: Infinity,
  },
  "!=": {
    operator: "!=",
    valueCount: Infinity,
  },
  inside: {
    operator: "inside",
    valueCount: 4,
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
  ">=": {
    operator: ">=",
    valueCount: 1,
  },
  "<=": {
    operator: "<=",
    valueCount: 1,
  },
};
