import type { FilterOperatorOption } from "metabase/querying/filters/utils/operators";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<Lib.TimeFilterOperatorName> {
  valueCount: number;
}

export type TimeValue = Date | null;
