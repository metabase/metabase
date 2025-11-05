import type { FilterOperatorOption } from "metabase/querying/filters/types";
import type * as Lib from "metabase-lib";

export type OperatorType = "exact" | "partial" | "empty";

export interface OperatorOption
  extends FilterOperatorOption<Lib.StringFilterOperator> {
  type: OperatorType;
}
