import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { Outlet, useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { useDataModelSegmentPage } from "../../hooks/use-data-model-segment-page";
import { SegmentDependenciesPage } from "../SegmentDependenciesPage";

type DataModelSegmentDependenciesPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

export function DataModelSegmentDependenciesPage() {
  const params = useParams<DataModelSegmentDependenciesPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    useDataModelSegmentPage(params);

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
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    >
      <Outlet />
    </SegmentDependenciesPage>
  );
}
