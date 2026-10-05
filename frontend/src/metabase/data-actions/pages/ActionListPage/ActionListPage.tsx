import type { Row } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useListActionsQuery,
  useListCollectionsTreeQuery,
  useListDatabasesQuery,
  useSearchQuery,
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
  Group,
  Icon,
  type RenderRowLink,
  Select,
  Stack,
  Text,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { getUserName } from "metabase/utils/user";
import type { CardId, Database, WritebackAction } from "metabase-types/api";

import { ActionsHeader } from "../../components/ActionsHeader";

import {
  type ActionFilters,
  type ActionTreeNode,
  buildActionTree,
  filterActions,
} from "./utils";

const ALL_VALUE = "all";

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
  const [filters, setFilters] = useState<ActionFilters>({
    databaseId: null,
    creatorId: null,
  });

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
  const hasModelActions = actions.some((action) => action.model_id != null);
  const { data: modelsResponse } = useSearchQuery(
    hasModelActions
      ? { models: ["dataset"], context: "entity-picker" }
      : skipToken,
  );

  const databases = useMemo(
    () => databasesResponse?.data ?? [],
    [databasesResponse],
  );
  const modelNames = useMemo(
    () =>
      new Map(
        (modelsResponse?.data ?? []).map((model) => [model.id, model.name]),
      ),
    [modelsResponse],
  );

  const treeData = useMemo(
    () => buildActionTree(collections, filterActions(actions, filters)),
    [collections, actions, filters],
  );

  const columns = useMemo(
    () => getColumns({ databases, modelNames }),
    [databases, modelNames],
  );

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
  const emptyMessage =
    treeData.length === 0
      ? actions.length === 0
        ? t`No actions yet`
        : t`No actions found`
      : treeTableInstance.rows.length === 0 && searchQuery
        ? t`No actions found`
        : null;

  return (
    <PageContainer data-testid="actions-list" gap={0}>
      <ActionsHeader />
      <Stack className={CS.overflowHidden}>
        <Flex gap="md">
          <TextInput
            placeholder={t`Search actions…`}
            leftSection={<Icon name="search" />}
            flex="1"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <DatabaseFilter
            actions={actions}
            databases={databases}
            value={filters.databaseId}
            onChange={(databaseId) => setFilters({ ...filters, databaseId })}
          />
          <CreatorFilter
            actions={actions}
            value={filters.creatorId}
            onChange={(creatorId) => setFilters({ ...filters, creatorId })}
          />
        </Flex>
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

type ColumnsOptions = {
  databases: Database[];
  modelNames: Map<CardId | string, string>;
};

function getColumns({
  databases,
  modelNames,
}: ColumnsOptions): TreeTableColumnDef<ActionTreeNode>[] {
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
      cell: ({ row }) => {
        const modelId = row.original.action?.model_id;
        const modelName = modelId != null ? modelNames.get(modelId) : undefined;
        return (
          <Group gap="sm" wrap="nowrap" miw={0}>
            <EntityNameCell
              data-testid="tree-node-name"
              icon={row.original.icon}
              iconColor={
                row.original.nodeType === "action"
                  ? "core-brand"
                  : "text-secondary"
              }
              name={row.original.name}
            />
            {modelName && (
              <Text c="text-secondary" size="sm" lineClamp={1}>
                {modelName}
              </Text>
            )}
          </Group>
        );
      },
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

type DatabaseFilterProps = {
  actions: WritebackAction[];
  databases: Database[];
  value: number | null;
  onChange: (databaseId: number | null) => void;
};

function DatabaseFilter({
  actions,
  databases,
  value,
  onChange,
}: DatabaseFilterProps) {
  const options = useMemo(() => {
    const databaseIds = new Set(actions.map((action) => action.database_id));
    return [
      { value: ALL_VALUE, label: t`Database: All` },
      ...databases
        .filter((database) => databaseIds.has(database.id))
        .map((database) => ({
          value: String(database.id),
          label: t`Database: ${database.name}`,
        })),
    ];
  }, [actions, databases]);

  return (
    <Select
      aria-label={t`Database`}
      data={options}
      value={value != null ? String(value) : ALL_VALUE}
      allowDeselect={false}
      w="12rem"
      onChange={(next) =>
        onChange(next && next !== ALL_VALUE ? Number(next) : null)
      }
    />
  );
}

type CreatorFilterProps = {
  actions: WritebackAction[];
  value: number | null;
  onChange: (creatorId: number | null) => void;
};

function CreatorFilter({ actions, value, onChange }: CreatorFilterProps) {
  const options = useMemo(() => {
    const creators = _.uniq(
      actions.map((action) => action.creator),
      (creator) => creator.id,
    );
    return [
      { value: ALL_VALUE, label: t`Created by: Anyone` },
      ...creators.map((creator) => ({
        value: String(creator.id),
        label: t`Created by: ${getUserName(creator)}`,
      })),
    ];
  }, [actions]);

  return (
    <Select
      aria-label={t`Created by`}
      data={options}
      value={value != null ? String(value) : ALL_VALUE}
      allowDeselect={false}
      w="14rem"
      onChange={(next) =>
        onChange(next && next !== ALL_VALUE ? Number(next) : null)
      }
    />
  );
}
