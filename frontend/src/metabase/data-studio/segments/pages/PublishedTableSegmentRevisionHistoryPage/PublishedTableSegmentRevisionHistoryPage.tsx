import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks";
import { SegmentRevisionHistoryPage } from "../SegmentRevisionHistoryPage";

type PublishedTableSegmentRevisionHistoryPageParams = {
  tableId: string;
  segmentId: string;
};

type PublishedTableSegmentRevisionHistoryPageProps = {
  params: PublishedTableSegmentRevisionHistoryPageParams;
};

export function PublishedTableSegmentRevisionHistoryPage({
  params,
}: PublishedTableSegmentRevisionHistoryPageProps) {
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
