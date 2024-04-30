import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<string, OperatorOption> = {
  "=": {
    operator: "=",
    hasValues: true,
  },
  "!=": {
    operator: "!=",
    hasValues: true,
  },
  contains: {
    operator: "contains",
    hasValues: true,
    hasCaseSensitiveOption: true,
  },
  "does-not-contain": {
    operator: "does-not-contain",
    hasValues: true,
    hasCaseSensitiveOption: true,
  },
  "starts-with": {
    operator: "starts-with",
    hasValues: true,
    hasCaseSensitiveOption: true,
  },
  "ends-with": {
    operator: "ends-with",
    hasValues: true,
    hasCaseSensitiveOption: true,
  },
  "is-empty": {
    operator: "is-empty",
    hasValues: false,
  },
  "not-empty": {
    operator: "not-empty",
    hasValues: false,
  },
};
