import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import {
  DataModelBreadcrumbs,
  PublishedTableBreadcrumbs,
} from "metabase-enterprise/data-studio/common/components/Breadcrumbs";
import type { Measure, Table } from "metabase-types/api";

type MeasureBreadcrumbsProps = {
  table: Table;
  measure?: Measure;
};

export function PublishedTableMeasureBreadcrumbs({
  table,
  measure,
}: MeasureBreadcrumbsProps) {
  return (
    <PublishedTableBreadcrumbs
      table={table}
      entityName={measure?.name}
      newEntityLabel={t`New measure`}
      tableListUrl={Urls.dataStudioTableMeasures(table.id)}
    />
  );
}

export function DataModelMeasureBreadcrumbs({
  table,
  measure,
}: MeasureBreadcrumbsProps) {
  return (
    <DataModelBreadcrumbs
      table={table}
      entityName={measure?.name}
      newEntityLabel={t`New measure`}
      tableListUrl={Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        tab: "measures",
      })}
    />
  );
}
