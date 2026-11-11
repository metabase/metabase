import type { ReactNode } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { DataModelBreadcrumbs } from "metabase/data-studio/common/components/DataModelBreadcrumbs";
import { PublishedTableBreadcrumbs } from "metabase/data-studio/common/components/PublishedTableBreadcrumbs";
import {
  type MeasureGroup,
  useMeasureGroups,
} from "metabase/metadata/measure-groups";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";
import type { Table, TableId } from "metabase-types/api";

import { MeasureGroupPage } from "./MeasureGroupPage";

/** Where the page sits: the Library or Connected data */
type MeasureGroupContext = {
  getBreadcrumbs: (group: MeasureGroup | undefined) => ReactNode;
  listUrl: string;
};

type LoadedMeasureGroupPageProps = {
  tableId: TableId | undefined;
  groupId: string | undefined;
  getContext: (table: Table) => MeasureGroupContext | null;
};

function LoadedMeasureGroupPage({
  tableId,
  groupId,
  getContext,
}: LoadedMeasureGroupPageProps) {
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId);
  const { getMeasureGroups } = useMeasureGroups();
  const group =
    table && groupId != null
      ? getMeasureGroups(table).find(({ id }) => id === groupId)
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
            (isMissingGroup ? t`This measure group doesn't exist.` : null)
          }
        />
      </Center>
    );
  }

  return (
    <MeasureGroupPage
      // Fresh form state per group
      key={groupId ?? "new"}
      table={table}
      group={group}
      breadcrumbs={context.getBreadcrumbs(group)}
      listUrl={context.listUrl}
    />
  );
}

type PublishedTableMeasureGroupParams = {
  tableId: string;
  groupId?: string;
};

export function PublishedTableMeasureGroupPage() {
  const params = useParams<PublishedTableMeasureGroupParams>();

  return (
    <LoadedMeasureGroupPage
      tableId={Urls.extractEntityId(params.tableId)}
      groupId={params.groupId}
      getContext={(table) => {
        const listUrl = Urls.dataStudioPublishedTableMeasureGroups(table.id);
        return {
          listUrl,
          getBreadcrumbs: (group) => (
            <PublishedTableBreadcrumbs
              table={table}
              entityName={group?.name}
              newEntityLabel={t`New measure group`}
              tableListUrl={listUrl}
            />
          ),
        };
      }}
    />
  );
}

type DataModelMeasureGroupParams = {
  databaseId: string;
  schemaId: string;
  tableId: string;
  groupId?: string;
};

export function DataModelMeasureGroupPage() {
  const params = useParams<DataModelMeasureGroupParams>();
  const databaseId = Number(params.databaseId);
  const schemaName = getSchemaName(params.schemaId);

  return (
    <LoadedMeasureGroupPage
      tableId={Urls.extractEntityId(params.tableId)}
      groupId={params.groupId}
      getContext={(table) => {
        if (schemaName == null) {
          return null;
        }
        const listUrl = Urls.dataStudioDataModelMeasureGroups({
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
              newEntityLabel={t`New measure group`}
              tableListUrl={listUrl}
            />
          ),
        };
      }}
    />
  );
}
