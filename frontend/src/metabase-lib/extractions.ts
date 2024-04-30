import * as ML from "cljs/metabase.lib.js";

import type { ColumnExtraction, Query } from "./types";

export function extract(
  query: Query,
  stageIndex: number,
  extraction: ColumnExtraction,
): Query {
  return ML.extract(query, stageIndex, extraction);
}
