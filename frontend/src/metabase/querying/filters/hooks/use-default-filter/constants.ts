import type * as Lib from "metabase-lib";

import type { DefaultFilterOperatorInfo } from "./types";

export const OPERATORS: Record<
  Lib.DefaultFilterOperator,
  DefaultFilterOperatorInfo
> = {
  "is-null": {
    operator: "is-null",
  },
  "not-null": {
    operator: "not-null",
  },
};
