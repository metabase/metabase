import * as ML from "cljs/metabase.lib.js";

import type { ColumnMetadata, SegmentMetadata } from "./types";

export function isColumnMetadata(arg: unknown): arg is ColumnMetadata {
  return ML.is_column_metadata(arg);
}

export function isSegmentMetadata(arg: unknown): arg is SegmentMetadata {
  return ML.is_segment_metadata(arg);
}
