import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center } from "metabase/ui";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { useDataModelSegmentPage } from "../../hooks";
import { SegmentRevisionHistoryPage } from "../SegmentRevisionHistoryPage";

type DataModelSegmentRevisionHistoryPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  segmentId: string;
};

type DataModelSegmentRevisionHistoryPageProps = {
  params: DataModelSegmentRevisionHistoryPageParams;
};

export function DataModelSegmentRevisionHistoryPage({
  params,
}: DataModelSegmentRevisionHistoryPageProps) {
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
