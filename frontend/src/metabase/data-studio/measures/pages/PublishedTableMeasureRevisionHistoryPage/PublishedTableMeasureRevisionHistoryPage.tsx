import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks/use-published-table-measure-page";
import { MeasureRevisionHistoryPage } from "../MeasureRevisionHistoryPage";

type PublishedTableMeasureRevisionHistoryPageParams = {
  tableId: string;
  measureId: string;
};

export function PublishedTableMeasureRevisionHistoryPage() {
  const params = useParams<PublishedTableMeasureRevisionHistoryPageParams>();
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    usePublishedTableMeasurePage(params);

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
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
