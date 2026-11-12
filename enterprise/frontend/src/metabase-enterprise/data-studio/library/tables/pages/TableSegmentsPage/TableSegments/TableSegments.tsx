import {
  type SegmentListUrls,
  SegmentTree,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/SegmentList";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type TableSegmentsProps = {
  table: Table;
};

/**
 * The published table's segments: its custom segments and segment groups,
 * the default segments sync makes, and what sync proposes, opening the
 * Library's segment pages
 */
export function TableSegments({ table }: TableSegmentsProps) {
  return <SegmentTree table={table} urls={getPublishedSegmentUrls(table)} />;
}

function getPublishedSegmentUrls(table: Table): SegmentListUrls {
  return {
    segment: (segmentId) =>
      Urls.dataStudioPublishedTableSegment(table.id, segmentId),
    systemSegment: (role) =>
      Urls.dataStudioPublishedTableSystemSegment(table.id, role),
    newSegment: Urls.dataStudioPublishedTableSegmentNew(table.id),
    segmentGroup: (groupId) =>
      Urls.dataStudioPublishedTableSegmentGroup(table.id, groupId),
    newSegmentGroup: Urls.dataStudioPublishedTableSegmentGroupNew(table.id),
  };
}
