import type { FilterOperatorOption } from "metabase/querying/filters/utils";
import type * as Lib from "metabase-lib";

export interface OperatorOption
  extends FilterOperatorOption<Lib.BooleanFilterOperatorName> {
  valueCount: number;
  isAdvanced?: boolean;
}
