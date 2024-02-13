import type * as Lib from "metabase-lib";
import type { FilterOperatorOption } from "metabase/querying/utils/filters";

export interface OperatorOption
  extends FilterOperatorOption<Lib.StringFilterOperatorName> {
  valueCount: number;
  hasMultipleValues?: boolean;
  hasCaseSensitiveOption?: boolean;
}
