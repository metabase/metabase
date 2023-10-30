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
  contains: {
    operator: "contains",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  "does-not-contain": {
    operator: "does-not-contain",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  "starts-with": {
    operator: "starts-with",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  "ends-with": {
    operator: "ends-with",
    valueCount: 1,
    hasCaseSensitiveOption: true,
  },
  "is-empty": {
    operator: "is-empty",
    valueCount: 0,
  },
  "not-empty": {
    operator: "not-empty",
    valueCount: 0,
  },
};
