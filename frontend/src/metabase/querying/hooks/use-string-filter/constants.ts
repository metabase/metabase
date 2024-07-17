import type * as Lib from "metabase-lib";

import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<
  Lib.StringFilterOperatorName,
  OperatorOption
> = {
  "=": {
    operator: "=",
    type: "exact",
  },
  "!=": {
    operator: "!=",
    type: "exact",
  },
  contains: {
    operator: "contains",
    type: "partial",
  },
  "does-not-contain": {
    operator: "does-not-contain",
    type: "partial",
  },
  "starts-with": {
    operator: "starts-with",
    type: "partial",
  },
  "ends-with": {
    operator: "ends-with",
    type: "partial",
  },
  "is-empty": {
    operator: "is-empty",
    type: "empty",
  },
  "not-empty": {
    operator: "not-empty",
    type: "empty",
  },
};
