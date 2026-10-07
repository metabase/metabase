import type { Row } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useLocation } from "metabase/router";
import {
  Avatar,
  Card,
  Center,
  Ellipsified,
  EntityNameCell,
  Flex,
  Icon,
  type RenderRowLink,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database } from "metabase-types/api";

import { ActionsHeader } from "../../components/ActionsHeader";

import {
  type ActionTreeNode,
  buildActionTree,
  canCreateActions,
  getCollectionNodeId,
  getCreatorName,
  getDatabaseName,
  getDefaultExpanded,
  getEmptyMessage,
  getNodeId,
  getSubRows,
  globalFilterFn,
  isFilterable,
} from "./utils";

const renderRowLink: RenderRowLink<ActionTreeNode> = (row, props) => {
  const action = row.original.action;
  return action ? (
    <Link to={Urls.dataAction(action.id)} {...props} />
  ) : (
    props.children
  );
};

export function ActionListPage() {
  const location = useLocation();
  const targetCollectionId = Urls.extractEntityId(
    new URLSearchParams(location.search).get("collectionId") ?? undefined,
  );
  const hasScrolledRef = useRef(false);
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
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );

  const treeData = useMemo(
    () => buildActionTree(collections, actions),
    [collections, actions],
  );

  const columns = useMemo(() => getColumns(databases), [databases]);

  const defaultExpanded = useMemo(
    () => getDefaultExpanded(treeData, targetCollectionId),
    [treeData, targetCollectionId],
  );

  const treeTableInstance = useTreeTableInstance({
    data: treeData,
    columns,
    getNodeId,
    getSubRows,
    defaultExpanded,
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

  const isLoading =
    isLoadingActions || isLoadingCollections || isLoadingDatabases;

  useEffect(() => {
    if (targetCollectionId != null && !hasScrolledRef.current && !isLoading) {
      treeTableInstance.scrollToNode(getCollectionNodeId(targetCollectionId));
      hasScrolledRef.current = true;
    }
  }, [targetCollectionId, isLoading, treeTableInstance]);

  const error = actionsError ?? collectionsError ?? databasesError;
  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const emptyMessage = getEmptyMessage({
    hasActions: treeData.length > 0,
    hasResults: treeTableInstance.rows.length > 0,
  });

  return (
    <PageContainer data-testid="actions-list" gap={0}>
      <ActionsHeader canCreate={canCreateActions(databases)} />
      <Stack className={CS.overflowHidden}>
        <TextInput
          placeholder={t`Search actions…`}
          leftSection={<Icon name="search" />}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Card withBorder p={0}>
          <TreeTable
            instance={treeTableInstance}
            emptyState={
              emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
            }
            onRowClick={handleRowClick}
            renderRowLink={renderRowLink}
          />
        </Card>
      </Stack>
    </PageContainer>
  );
}

function getColumns(
  databases: Database[],
): TreeTableColumnDef<ActionTreeNode>[] {
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
      accessorFn: (node) => getDatabaseName(databases, node.action),
      header: t`Database`,
      minWidth: 160,
      enableSorting: true,
      cell: ({ row }) => (
        <Ellipsified>
          {getDatabaseName(databases, row.original.action)}
        </Ellipsified>
      ),
    },
    {
      id: "creator",
      accessorFn: (node) => getCreatorName(node.action),
      header: t`Created by`,
      minWidth: 160,
      enableSorting: true,
      cell: ({ row }) => {
        const name = getCreatorName(row.original.action);
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
