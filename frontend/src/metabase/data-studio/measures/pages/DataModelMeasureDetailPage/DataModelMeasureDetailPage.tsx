import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useParams } from "metabase/router";
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

export function DataModelMeasureDetailPage() {
  const params = useParams<DataModelMeasureDetailPageParams>();
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
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
