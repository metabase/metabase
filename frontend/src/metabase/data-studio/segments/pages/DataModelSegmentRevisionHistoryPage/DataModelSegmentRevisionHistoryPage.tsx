import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { useDataModelSegmentPage } from "../../hooks/use-data-model-segment-page";
import { SegmentRevisionHistoryPage } from "../SegmentRevisionHistoryPage";

type DataModelSegmentRevisionHistoryPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

export function DataModelSegmentRevisionHistoryPage() {
  const params = useParams<DataModelSegmentRevisionHistoryPageParams>();
  const { isLoading, error, segment, table, tabUrls, onRemove } =
    useDataModelSegmentPage(params);

  if (isLoading) {
    return <EntityDetailPageSkeleton page="revisions" />;
  }

  if (error || !segment || !table || !tabUrls) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <SegmentRevisionHistoryPage
      segment={segment}
      tabUrls={tabUrls}
      breadcrumbs={
        <DataModelSegmentBreadcrumbs table={table} segment={segment} />
      }
      onRemove={onRemove}
    />
  );
}
