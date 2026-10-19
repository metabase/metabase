import {
  skipToken,
  useGetTableQueryMetadataQuery,
  useListSegmentsQuery,
} from "metabase/api";
import type { SegmentId } from "metabase-types/api";

/**
 * The segment and the table it filters, which every reference segment page
 * needs to name itself and to describe the segment's definition.
 *
 * The segment comes from the list rather than `GET /api/segment/:id`, which is
 * the request the pages already make to resolve the segment's table.
 */
export function useSegmentPage(segmentId: SegmentId) {
  const {
    data: segments,
    isLoading: isLoadingSegments,
    error: segmentsError,
  } = useListSegmentsQuery();

  const segment = segments?.find(({ id }) => id === segmentId);

  const { data: table, error: tableError } = useGetTableQueryMetadataQuery(
    segment?.table_id != null ? { id: segment.table_id } : skipToken,
  );

  return {
    segment,
    table,
    isLoading:
      isLoadingSegments ||
      (segment != null && table == null && tableError == null),
    error: segmentsError ?? tableError,
  };
}
