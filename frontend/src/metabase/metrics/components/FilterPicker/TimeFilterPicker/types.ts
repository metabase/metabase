import type * as LibMetric from "metabase-lib/metric";

import type { FilterOperatorOption } from "../types";

export type TimeFilterOperatorOption =
  FilterOperatorOption<LibMetric.TimeFilterOperator>;

export type TimeFilterOperatorInfo = {
  operator: LibMetric.TimeFilterOperator;
  valueCount: number;
};

export type TimeValue = Date | null;
