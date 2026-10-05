import type { Row } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useListActionsQuery,
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import CS from "metabase/css/core/index.css";
import {
  Avatar,
  Card,
  Ellipsified,
  EntityNameCell,
  Flex,
  Icon,
  type RenderRowLink,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getUserName } from "metabase/utils/user";
import type { Database, WritebackAction } from "metabase-types/api";

import { ActionsHeader } from "../../components/ActionsHeader";

import { type ActionTreeNode, buildActionTree } from "./utils";

const getNodeId = (node: ActionTreeNode) => node.id;
const getSubRows = (node: ActionTreeNode) => node.children;
const isFilterable = (node: ActionTreeNode) => node.nodeType === "action";

const globalFilterFn = (
  row: { original: ActionTreeNode },
  _columnId: string,
  filterValue: string,
) =>
  row.original.nodeType === "action" &&
  row.original.name.toLowerCase().includes(String(filterValue).toLowerCase());

const renderRowLink: RenderRowLink<ActionTreeNode> = (row, props) => {
  const action = row.original.action;
  return action ? (
    <Link to={Urls.dataAction(action.id)} {...props} />
  ) : (
    props.children
  );
};

export function ActionListPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: actions = [],
    isLoading: isLoadingActions,
    error: actionsError,
  } = useListActionsQuery({ type: "query" });
  const {
    data: collections = [],
    isLoading: isLoadingCollections,
    error: collectionsError,
  } = useListCollectionsTreeQuery({ "exclude-archived": true });
  const { data: databasesResponse } = useListDatabasesQuery();

  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );

  const treeData = useMemo(
    () => buildActionTree(collections, actions),
    [collections, actions],
  );

  const columns = useMemo(() => getColumns(databases), [databases]);

  const treeTableInstance = useTreeTableInstance({
    data: treeData,
    columns,
    getNodeId,
    getSubRows,
    defaultExpanded: true,
    expanded: searchQuery ? true : undefined,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    globalFilterFn,
    isFilterable,
  });

  const handleRowClick = (row: Row<ActionTreeNode>) => {
    if (row.getCanExpand()) {
      row.toggleExpanded();
    }
  };

  const error = actionsError ?? collectionsError;
  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const isLoading = isLoadingActions || isLoadingCollections;
  const emptyMessage = getEmptyMessage({
    hasActions: treeData.length > 0,
    hasResults: treeTableInstance.rows.length > 0,
  });

  return (
    <PageContainer data-testid="actions-list" gap={0}>
      <ActionsHeader />
      <Stack className={CS.overflowHidden}>
        <TextInput
          placeholder={t`Search actions…`}
          leftSection={<Icon name="search" />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Card withBorder p={0}>
          {isLoading ? (
            <TreeTableSkeleton columnWidths={[0.4, 0.2, 0.2, 0.2]} />
          ) : (
            <TreeTable
              instance={treeTableInstance}
              emptyState={
                emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
              }
              onRowClick={handleRowClick}
              renderRowLink={renderRowLink}
            />
          )}
        </Card>
      </Stack>
    </PageContainer>
  );
}

function getEmptyMessage({
  hasActions,
  hasResults,
}: {
  hasActions: boolean;
  hasResults: boolean;
}): string | null {
  switch (true) {
    case !hasActions:
      return t`No actions yet`;
    case !hasResults:
      return t`No actions found`;
    default:
      return null;
  }
}

function getColumns(
  databases: Database[],
): TreeTableColumnDef<ActionTreeNode>[] {
  const getDatabaseName = (action: WritebackAction | undefined) =>
    databases.find((database) => database.id === action?.database_id)?.name ??
    "";

  return [
    {
      id: "name",
      accessorKey: "name",
      header: t`Name`,
      minWidth: 280,
      maxAutoWidth: 800,
      enableSorting: true,
      cell: ({ row }) => (
        <EntityNameCell
          data-testid="tree-node-name"
          icon={row.original.icon}
          iconColor={
            row.original.nodeType === "action" ? "core-brand" : "text-secondary"
          }
          name={row.original.name}
        />
      ),
    },
    {
      id: "database",
      accessorFn: (node) => getDatabaseName(node.action),
      header: t`Database`,
      minWidth: 160,
      enableSorting: true,
      cell: ({ row }) => (
        <Ellipsified>{getDatabaseName(row.original.action)}</Ellipsified>
      ),
    },
    {
      id: "creator",
      accessorFn: (node) =>
        node.action ? (getUserName(node.action.creator) ?? "") : "",
      header: t`Created by`,
      minWidth: 160,
      enableSorting: true,
      cell: ({ row }) => {
        const creator = row.original.action?.creator;
        const name = creator ? getUserName(creator) : null;
        return name ? (
          <Flex align="center" gap="sm">
            <Avatar size="sm" name={name} />
            <Ellipsified>{name}</Ellipsified>
          </Flex>
        ) : null;
      },
    },
    {
      id: "updated_at",
      accessorFn: (node) => node.action?.updated_at ?? "",
      header: t`Last modified`,
      maxWidth: 200,
      minWidth: "auto",
      enableSorting: true,
      sortingFn: "datetime",
      sortDescFirst: true,
      cell: ({ row }) =>
        row.original.action ? (
          <DateTime value={row.original.action.updated_at} />
        ) : null,
    },
  ];
}
