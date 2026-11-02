import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { usePublishedTableMeasurePage } from "../../hooks/use-published-table-measure-page";
import { MeasureDetailPage } from "../MeasureDetailPage";

type PublishedTableMeasureDetailPageParams = {
  tableId: string;
  measureId: string;
};

export function PublishedTableMeasureDetailPage() {
  const params = useParams<PublishedTableMeasureDetailPageParams>();
  const { isLoading, error, measure, table, tabUrls, onRemove } =
    usePublishedTableMeasurePage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="definition" />;
  }

  if (error || !measure || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <MeasureDetailPage
      measure={measure}
      table={table}
      tabUrls={tabUrls}
      breadcrumbs={
        <PublishedTableMeasureBreadcrumbs table={table} measure={measure} />
      }
      onRemove={onRemove}
    />
  );
}
