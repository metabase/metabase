import type * as Lib from "metabase-lib";

import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<
  Lib.TimeFilterOperatorName,
  OperatorOption
> = {
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
  "is-null": {
    operator: "is-null",
    valueCount: 0,
  },
  "not-null": {
    operator: "not-null",
    valueCount: 0,
  },
};
