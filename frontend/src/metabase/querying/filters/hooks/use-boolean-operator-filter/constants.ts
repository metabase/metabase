import type * as Lib from "metabase-lib";

import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<
  Lib.BooleanFilterOperatorName,
  OperatorOption
> = {
  "=": {
    operator: "=",
    valueCount: 1,
  },
  "is-null": {
    operator: "is-null",
    valueCount: 0,
    isAdvanced: true,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
    isAdvanced: true,
  },
};
