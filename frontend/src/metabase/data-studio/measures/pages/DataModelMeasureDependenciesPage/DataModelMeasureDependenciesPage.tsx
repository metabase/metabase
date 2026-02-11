import type { ReactNode } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { useDataModelMeasurePage } from "../../hooks";
import { MeasureDependenciesPage } from "../MeasureDependenciesPage";

type DataModelMeasureDependenciesPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  measureId: string;
};

type DataModelMeasureDependenciesPageProps = {
  params: DataModelMeasureDependenciesPageParams;
  children?: ReactNode;
};

export function DataModelMeasureDependenciesPage({
  params,
  children,
}: DataModelMeasureDependenciesPageProps) {
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    useDataModelMeasurePage(params);

  if (isLoading || error || !measure || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <MeasureDependenciesPage
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    >
      {children}
    </MeasureDependenciesPage>
  );
}
