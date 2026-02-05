import type { ReactNode } from "react";
import type { Route } from "react-router";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/data-studio/common/hooks/use-load-table-with-metadata";
import * as Urls from "metabase/lib/urls";
import { Center } from "metabase/ui";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { NewMeasurePage } from "../NewMeasurePage";

type DataModelNewMeasurePageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
};

type DataModelNewMeasurePageProps = {
  params: DataModelNewMeasurePageParams;
  route: Route;
  children?: ReactNode;
};

export function DataModelNewMeasurePage({
  params,
  route,
}: DataModelNewMeasurePageProps) {
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
    <NewMeasurePage
      route={route}
      table={table}
      breadcrumbs={<DataModelMeasureBreadcrumbs table={table} />}
      getSuccessUrl={(measure) =>
        Urls.dataStudioDataModelMeasure({
          databaseId,
          schemaName,
          tableId,
          measureId: measure.id,
        })
      }
    />
  );
}
