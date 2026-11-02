import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks/use-published-table-segment-page";
import { SegmentRevisionHistoryPage } from "../SegmentRevisionHistoryPage";

type PublishedTableSegmentRevisionHistoryPageParams = {
  tableId: string;
  segmentId: string;
};

export function PublishedTableSegmentRevisionHistoryPage() {
  const params = useParams<PublishedTableSegmentRevisionHistoryPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    usePublishedTableSegmentPage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="revisions" />;
  }

  if (error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <SegmentRevisionHistoryPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}
