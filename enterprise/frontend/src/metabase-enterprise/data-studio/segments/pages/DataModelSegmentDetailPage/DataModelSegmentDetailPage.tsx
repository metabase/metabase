import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { useDataModelSegmentPage } from "../../hooks";
import { SegmentDetailPage } from "../SegmentDetailPage";

type DataModelSegmentDetailPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

type DataModelSegmentDetailPageProps = {
  params: DataModelSegmentDetailPageParams;
  route: Route;
};

export function DataModelSegmentDetailPage({
  params,
  route,
}: DataModelSegmentDetailPageProps) {
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    useDataModelSegmentPage(params);

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
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}
