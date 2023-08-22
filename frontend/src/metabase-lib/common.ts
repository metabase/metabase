import * as ML from "cljs/metabase.lib.js";

import type { FilterClause, FilterParts } from "./types";

export function filterParts(filter: FilterClause): FilterParts {
  const {
    args: [column, ...args],
    ...externalOp
  } = ML.external_op(filter);
  return { ...externalOp, column, args };
}
