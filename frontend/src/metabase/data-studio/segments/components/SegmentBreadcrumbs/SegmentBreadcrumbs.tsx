import { t } from "ttag";

import {
  DataModelBreadcrumbs,
  PublishedTableBreadcrumbs,
} from "metabase/data-studio/common/components/Breadcrumbs";
import * as Urls from "metabase/lib/urls";
import type { Segment, Table } from "metabase-types/api";

type SegmentBreadcrumbsProps = {
  table: Table;
  segment?: Segment;
};

export function PublishedTableSegmentBreadcrumbs({
  table,
  segment,
}: SegmentBreadcrumbsProps) {
  return (
    <PublishedTableBreadcrumbs
      table={table}
      entityName={segment?.name}
      newEntityLabel={t`New segment`}
      tableListUrl={Urls.dataStudioTableSegments(table.id)}
    />
  );
}

export function DataModelSegmentBreadcrumbs({
  table,
  segment,
}: SegmentBreadcrumbsProps) {
  return (
    <DataModelBreadcrumbs
      table={table}
      entityName={segment?.name}
      newEntityLabel={t`New segment`}
      tableListUrl={Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        tab: "segments",
      })}
    />
  );
}
