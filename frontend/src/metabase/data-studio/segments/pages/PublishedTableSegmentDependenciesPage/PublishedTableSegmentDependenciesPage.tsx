import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Outlet, useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { usePublishedTableSegmentPage } from "../../hooks";
import { SegmentDependenciesPage } from "../SegmentDependenciesPage";

type PublishedTableSegmentDependenciesPageParams = {
  tableId: string;
  segmentId: string;
};

export function PublishedTableSegmentDependenciesPage() {
  const params = useParams<PublishedTableSegmentDependenciesPageParams>();
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
