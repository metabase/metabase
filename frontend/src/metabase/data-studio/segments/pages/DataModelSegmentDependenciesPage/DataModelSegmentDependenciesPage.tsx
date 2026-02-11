import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { useDataModelSegmentPage } from "../../hooks";
import { SegmentDependenciesPage } from "../SegmentDependenciesPage";

type DataModelSegmentDependenciesPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

type DataModelSegmentDependenciesPageProps = {
  params: DataModelSegmentDependenciesPageParams;
  children?: ReactNode;
};

export function DataModelSegmentDependenciesPage({
  params,
  children,
}: DataModelSegmentDependenciesPageProps) {
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
    <SegmentDependenciesPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    >
      {children}
    </SegmentDependenciesPage>
  );
}
