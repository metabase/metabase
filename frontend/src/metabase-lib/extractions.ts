import * as ML from "cljs/metabase.lib.js";

import type { ColumnExtraction, ColumnMetadata, Query } from "./types";

export function columnExtractions(
  query: Query,
  column: ColumnMetadata,
): ColumnExtraction[] {
  return ML.column_extractions(query, column);
}
