import * as Urls from "metabase/lib/urls";
import type { Segment } from "metabase-types/api";

export function getSegmentPreviewUrl(segment: Segment): string {
  return Urls.newQuestion({ dataset_query: segment.definition });
}
