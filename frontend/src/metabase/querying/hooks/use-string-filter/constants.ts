import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<string, OperatorOption> = {
  "=": {
    operator: "=",
    category: "exact",
  },
  "!=": {
    operator: "!=",
    category: "exact",
  },
  contains: {
    operator: "contains",
    category: "partial",
  },
  "does-not-contain": {
    operator: "does-not-contain",
    category: "partial",
  },
  "starts-with": {
    operator: "starts-with",
    category: "partial",
  },
  "ends-with": {
    operator: "ends-with",
    category: "partial",
  },
  "is-empty": {
    operator: "is-empty",
    category: "empty",
  },
  "not-empty": {
    operator: "not-empty",
    category: "empty",
  },
};
