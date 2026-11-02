import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks/use-published-table-segment-page";
import { SegmentDetailPage } from "../SegmentDetailPage";

type PublishedTableSegmentDetailPageParams = {
  tableId: string;
  segmentId: string;
};

export function PublishedTableSegmentDetailPage() {
  const params = useParams<PublishedTableSegmentDetailPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    usePublishedTableSegmentPage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="definition" />;
  }

  if (error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <SegmentDetailPage
      segment={segment}
      table={table}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}
