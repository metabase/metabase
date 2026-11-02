import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { Outlet, useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks/use-published-table-segment-page";
import { SegmentDependenciesPage } from "../SegmentDependenciesPage";

type PublishedTableSegmentDependenciesPageParams = {
  tableId: string;
  segmentId: string;
};

export function PublishedTableSegmentDependenciesPage() {
  const params = useParams<PublishedTableSegmentDependenciesPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    usePublishedTableSegmentPage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="dependencies" />;
  }

  if (error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <SegmentDependenciesPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    >
      <Outlet />
    </SegmentDependenciesPage>
  );
}
