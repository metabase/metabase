import type * as LibMetric from "metabase-lib/metric";

import type { TimeFilterOperatorInfo } from "./types";

export const OPERATORS: Record<
  LibMetric.TimeFilterOperator,
  TimeFilterOperatorInfo
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
