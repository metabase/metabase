import type * as Lib from "metabase-lib";
import type { FilterOperatorOption } from "metabase/querying/utils/filters";

export interface OperatorOption
  extends FilterOperatorOption<Lib.NumberFilterOperatorName> {
  valueCount: number;
  hasMultipleValues?: boolean;
}

export type NumberValue = number | "";
