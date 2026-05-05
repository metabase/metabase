import type { Route } from "react-router";

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
  route: Route;
};

export function PublishedTableSegmentDetailPage({
  params,
  route,
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
      route={route}
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}
