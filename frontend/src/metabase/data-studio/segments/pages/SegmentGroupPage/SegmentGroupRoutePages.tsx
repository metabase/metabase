import type { ReactNode } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { DataModelBreadcrumbs } from "metabase/data-studio/common/components/DataModelBreadcrumbs";
import { PublishedTableBreadcrumbs } from "metabase/data-studio/common/components/PublishedTableBreadcrumbs";
import {
  type SegmentGroup,
  useSegmentGroups,
} from "metabase/metadata/segment-groups";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type { Table, TableId } from "metabase-types/api";

import { SegmentGroupPage } from "./SegmentGroupPage";

/** Where the page sits: the Library or Connected data */
type SegmentGroupContext = {
  getBreadcrumbs: (group: SegmentGroup | undefined) => ReactNode;
  listUrl: string;
};

type LoadedSegmentGroupPageProps = {
  tableId: TableId | undefined;
  groupId: string | undefined;
  getContext: (table: Table) => SegmentGroupContext | null;
};

function LoadedSegmentGroupPage({
  tableId,
  groupId,
  getContext,
}: LoadedSegmentGroupPageProps) {
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });
  const { getSegmentGroups } = useSegmentGroups();
  const group =
    table && groupId != null
      ? getSegmentGroups(table).find(({ id }) => id === groupId)
      : undefined;
  const context = table ? getContext(table) : null;
  const isMissingGroup = groupId != null && group == null;

  if (isLoading || error || !table || !context || isMissingGroup) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={
            error ??
            (isMissingGroup ? t`This segment group doesn't exist.` : null)
          }
        />
      </Center>
    );
  }

  return (
    <SegmentGroupPage
      // Fresh form state per group
      key={groupId ?? "new"}
      table={table}
      group={group}
      breadcrumbs={context.getBreadcrumbs(group)}
      listUrl={context.listUrl}
    />
  );
}

type PublishedTableSegmentGroupParams = {
  tableId: string;
  groupId?: string;
};

export function PublishedTableSegmentGroupPage() {
  const params = useParams<PublishedTableSegmentGroupParams>();
  const tableId = Urls.extractEntityId(params.tableId);

  return (
    <LoadedSegmentGroupPage
      tableId={tableId}
      groupId={params.groupId}
      getContext={(table) => {
        const listUrl = Urls.dataStudioPublishedTableSegmentGroups(table.id);
        return {
          listUrl,
          getBreadcrumbs: (group) => (
            <PublishedTableBreadcrumbs
              table={table}
              entityName={group?.name}
              newEntityLabel={t`New segment group`}
              tableListUrl={listUrl}
            />
          ),
        };
      }}
    />
  );
}

type DataModelSegmentGroupParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  groupId?: string;
};

export function DataModelSegmentGroupPage() {
  const params = useParams<DataModelSegmentGroupParams>();
  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);
  const tableId = Urls.extractEntityId(params.tableId);

  return (
    <LoadedSegmentGroupPage
      tableId={tableId}
      groupId={params.groupId}
      getContext={(table) => {
        if (schemaName == null) {
          return null;
        }
        const listUrl = Urls.dataStudioDataModelSegmentGroups({
          databaseId,
          schemaName,
          tableId: table.id,
        });
        return {
          listUrl,
          getBreadcrumbs: (group) => (
            <DataModelBreadcrumbs
              table={table}
              entityName={group?.name}
              newEntityLabel={t`New segment group`}
              tableListUrl={listUrl}
            />
          ),
        };
      }}
    />
  );
}
