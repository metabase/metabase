import {
  SegmentList,
  type SegmentListUrls,
} from "metabase/data-studio/data-model/pages/DataModel/TableSection/SegmentList";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  ListLayoutToggle,
  useListLayout,
} from "../../../components/ListLayoutToggle";

type TableSegmentsProps = {
  table: Table;
};

/**
 * The published table's segments: its custom segments and segment groups,
 * the system segments every table has, and what sync proposes, the same
 * list Connected data shows, opening the Library's segment pages.
 */
export function TableSegments({ table }: TableSegmentsProps) {
  const [layout, setLayout] = useListLayout();
  return (
    <>
      <SegmentList
        table={table}
        getUrls={getPublishedSegmentUrls}
        isSearchable={false}
        isFullPage
        hasDefaultSegmentSetting
        layout={layout}
      />
      <ListLayoutToggle layout={layout} onChange={setLayout} />
    </>
  );
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
