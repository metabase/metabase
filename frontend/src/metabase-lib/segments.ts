import { available_segments, segment_metadata } from "cljs/metabase.lib.js";
import type { SegmentId } from "metabase-types/api";

import type { Query, SegmentMetadata } from "./types";

export function availableSegments(
  query: Query,
  stageIndex: number,
): SegmentMetadata[] {
  return available_segments(query, stageIndex);
}

export function segmentMetadata(
  query: Query,
  segmentId: SegmentId,
): SegmentMetadata | null {
  return segment_metadata(query, segmentId);
}
