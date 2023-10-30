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
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};
