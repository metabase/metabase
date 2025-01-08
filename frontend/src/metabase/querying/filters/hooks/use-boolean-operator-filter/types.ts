import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<Lib.BooleanFilterOperator> {
  valueCount: number;
  isAdvanced?: boolean;
}
