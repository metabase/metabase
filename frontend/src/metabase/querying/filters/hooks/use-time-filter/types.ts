import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<Lib.TimeFilterOperator> {
  valueCount: number;
}

export type TimeValue = Date | null;
