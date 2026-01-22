import type { ReactNode } from "react";
import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";
import { useLoadTableWithMetadata } from "metabase-enterprise/data-studio/common/hooks/use-load-table-with-metadata";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { NewSegmentPage } from "../NewSegmentPage";

type DataModelNewSegmentPageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
};

type DataModelNewSegmentPageProps = {
  params: DataModelNewSegmentPageParams;
  route: Route;
  children?: ReactNode;
};

export function DataModelNewSegmentPage({
  params,
  route,
}: DataModelNewSegmentPageProps) {
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
      route={route}
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
