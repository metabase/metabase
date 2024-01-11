import * as ML from "cljs/metabase.lib.js";
import type { SegmentId } from "metabase-types/api";

import type { Query, SegmentMetadata } from "./types";

export function availableSegments(
  query: Query,
  stageIndex: number,
): SegmentMetadata[] {
  return ML.available_segments(query, stageIndex);
}

export function segment(
  query: Query,
  segmentId: SegmentId,
): SegmentMetadata | null {
  return ML.segment(query, segmentId);
}
