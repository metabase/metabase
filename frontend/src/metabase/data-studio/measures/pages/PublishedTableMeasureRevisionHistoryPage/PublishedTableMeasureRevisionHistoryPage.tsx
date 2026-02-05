import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks";
import { MeasureRevisionHistoryPage } from "../MeasureRevisionHistoryPage";

type PublishedTableMeasureRevisionHistoryPageParams = {
  tableId: string;
  measureId: string;
};

type PublishedTableMeasureRevisionHistoryPageProps = {
  params: PublishedTableMeasureRevisionHistoryPageParams;
};

export function PublishedTableMeasureRevisionHistoryPage({
  params,
}: PublishedTableMeasureRevisionHistoryPageProps) {
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    usePublishedTableMeasurePage(params);

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
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
