import type { FilterOperatorOption } from "metabase/querying/utils/filters";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<Lib.TimeFilterOperatorName> {
  valueCount: number;
}

export type TimeValue = Date | null;
