import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { PublishedTableMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { NewMeasurePage } from "../NewMeasurePage";

type PublishedTableNewMeasurePageParams = {
  tableId: string;
};

export function PublishedTableNewMeasurePage() {
  const params = useParams<PublishedTableNewMeasurePageParams>();
  const tableId = Urls.extractEntityId(params.tableId);

  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });

  if (isLoading || error || !table || tableId == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <NewMeasurePage
      table={table}
      breadcrumbs={<PublishedTableMeasureBreadcrumbs table={table} />}
      getSuccessUrl={(measure) =>
        Urls.dataStudioPublishedTableMeasure(tableId, measure.id)
      }
    />
  );
}
