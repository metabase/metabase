import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { useDataModelMeasurePage } from "../../hooks/use-data-model-measure-page";
import { MeasureRevisionHistoryPage } from "../MeasureRevisionHistoryPage";

type DataModelMeasureRevisionHistoryPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  measureId: string;
};

export function DataModelMeasureRevisionHistoryPage() {
  const params = useParams<DataModelMeasureRevisionHistoryPageParams>();
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    useDataModelMeasurePage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="revisions" />;
  }

  if (error || !measure || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
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
