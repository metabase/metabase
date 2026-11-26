import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { EntityDetailPageSkeleton } from "metabase/data-studio/common/components/EntityDetailPageSkeleton";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { NewMeasurePage } from "../NewMeasurePage";

type DataModelNewMeasurePageParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
};

export function DataModelNewMeasurePage() {
  const params = useParams<DataModelNewMeasurePageParams>();
  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading) {
    return <EntityDetailPageSkeleton page="new" />;
  }

  if (error || !table || tableId == null || schemaName == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper error={error} />
      </Center>
    );
  }

  return (
    <NewMeasurePage
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
