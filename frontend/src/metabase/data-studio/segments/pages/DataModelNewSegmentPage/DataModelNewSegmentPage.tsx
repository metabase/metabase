import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { NewSegmentPage } from "../NewSegmentPage";

type DataModelNewSegmentPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
};

export function DataModelNewSegmentPage() {
  const params = useParams<DataModelNewSegmentPageParams>();
  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error || !table || tableId == null || schemaName == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <NewSegmentPage
      table={table}
      breadcrumbs={<DataModelSegmentBreadcrumbs table={table} />}
      getSuccessUrl={(segment) =>
        Urls.dataStudioDataModelSegment({
          databaseId,
          schemaName,
          tableId,
          segmentId: segment.id,
        })
      }
    />
  );
}
