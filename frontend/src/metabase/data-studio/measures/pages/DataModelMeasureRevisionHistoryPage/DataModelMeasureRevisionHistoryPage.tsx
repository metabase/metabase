import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { useDataModelMeasurePage } from "../../hooks";
import { MeasureRevisionHistoryPage } from "../MeasureRevisionHistoryPage";

type DataModelMeasureRevisionHistoryPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  measureId: string;
};

type DataModelMeasureRevisionHistoryPageProps = {
  params: DataModelMeasureRevisionHistoryPageParams;
};

export function DataModelMeasureRevisionHistoryPage({
  params,
}: DataModelMeasureRevisionHistoryPageProps) {
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
    <MeasureRevisionHistoryPage
      measure={measure}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
