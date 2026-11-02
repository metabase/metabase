import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { PublishedTableSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { NewSegmentPage } from "../NewSegmentPage";

type PublishedTableNewSegmentPageParams = {
  tableId: string;
};

export function PublishedTableNewSegmentPage() {
  const params = useParams<PublishedTableNewSegmentPageParams>();
  const tableId = Urls.extractEntityId(params.tableId);

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading) {
    return <EntityDetailPageSkeleton page="new" />;
  }

  if (error || !table || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <NewSegmentPage
      table={table}
      breadcrumbs={<PublishedTableSegmentBreadcrumbs table={table} />}
      getSuccessUrl={(segment) =>
        Urls.dataStudioPublishedTableSegment(tableId, segment.id)
      }
    />
  );
}
