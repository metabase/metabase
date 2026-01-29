import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks";
import { SegmentDetailPage } from "../SegmentDetailPage";

type PublishedTableSegmentDetailPageParams = {
  tableId: string;
  segmentId: string;
};

type PublishedTableSegmentDetailPageProps = {
  params: PublishedTableSegmentDetailPageParams;
};

export function PublishedTableSegmentDetailPage({
  params,
}: PublishedTableSegmentDetailPageProps) {
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    usePublishedTableSegmentPage(params);

  if (isLoading || error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <SegmentDetailPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}
