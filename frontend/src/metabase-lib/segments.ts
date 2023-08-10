import * as ML from "cljs/metabase.lib.js";

import type { SegmentMetadata, Query } from "./types";

export function availableSegments(query: Query): SegmentMetadata[] {
  return ML.available_segments(query);
}
