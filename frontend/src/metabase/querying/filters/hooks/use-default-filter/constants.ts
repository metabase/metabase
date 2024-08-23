import type * as Lib from "metabase-lib";

import type { OperatorOption } from "./types";

export const OPERATOR_OPTIONS: Record<
  Lib.DefaultFilterOperatorName,
  OperatorOption
> = {
  "is-null": {
    operator: "is-null",
  },
  "not-null": {
    operator: "not-null",
  },
};
