import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { useDataModelMeasurePage } from "../../hooks";
import { MeasureDetailPage } from "../MeasureDetailPage";

type DataModelMeasureDetailPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  measureId: string;
};

type DataModelMeasureDetailPageProps = {
  params: DataModelMeasureDetailPageParams;
  route: Route;
};

export function DataModelMeasureDetailPage({
  params,
  route,
}: DataModelMeasureDetailPageProps) {
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
    <MeasureDetailPage
      route={route}
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
