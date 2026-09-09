import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useGetIcon } from "metabase/hooks/use-icon";
import {
  EntityNameCell,
  type RenderRowLink,
  Text,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  Collection,
  IconName,
  RemoteSyncEntity,
  WorktreeId,
} from "metabase-types/api";

import {
  type CollectionGroup,
  type TableGroup,
  getGroupIcon,
} from "../../displayGroups";
import { useCollectionGroups } from "../../hooks/use-collection-groups";
import { getSyncStatusLabel } from "../../utils";

import { getEntityIcon, getWorktreeEntityUrl } from "./utils";

type WorktreeChangesListProps = {
  worktreeId: WorktreeId;
  branch: string;
  entities: RemoteSyncEntity[];
  isLoading: boolean;
  error: unknown;
};

/**
 * A row in the changes table: a collection heading, a table that only groups its dirty
 * children, or a dirty entity.
 */
type ChangeNode = {
  id: string;
  kind: "group" | "table" | "entity";
  name: string;
  icon: IconName;
  entity: RemoteSyncEntity | null;
  href: string | null;
  children?: ChangeNode[];
};

const ROW_TEST_IDS: Record<ChangeNode["kind"], string> = {
  group: "worktree-change-group",
  table: "worktree-change-table",
  entity: "worktree-change-row",
};

const getNodeId = (node: ChangeNode) => node.id;
const getSubRows = (node: ChangeNode) => node.children;
const getRowProps = (row: Row<ChangeNode>) => ({
  "data-testid": ROW_TEST_IDS[row.original.kind],
});

export function WorktreeChangesList({
  worktreeId,
  branch,
  entities,
  isLoading,
  error,
}: WorktreeChangesListProps) {
  const {
    groups,
    collectionMap,
    isLoading: isLoadingGroups,
  } = useCollectionGroups(entities, { worktreeId });
  const getIcon = useGetIcon();

  const data = useMemo(
    () => buildChangeTree(groups, { worktreeId, collectionMap, getIcon }),
    [groups, worktreeId, collectionMap, getIcon],
  );

  const columns = useMemo<TreeTableColumnDef<ChangeNode>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t`Name`,
        minWidth: 280,
        maxAutoWidth: 800,
        cell: ({ row }) => (
          <EntityNameCell
            icon={row.original.icon}
            iconColor={
              row.original.kind === "entity" ? "core-brand" : "text-secondary"
            }
            name={row.original.name}
          />
        ),
      },
      {
        id: "change",
        accessorFn: (node) => node.entity?.sync_status ?? "",
        header: t`Change`,
        minWidth: 120,
        maxWidth: 160,
        cell: ({ row }) =>
          row.original.entity ? (
            <Text c="text-secondary">
              {getSyncStatusLabel(row.original.entity.sync_status)}
            </Text>
          ) : null,
      },
    ],
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data,
    columns,
    getNodeId,
    getSubRows,
    defaultExpanded: true,
    enableSorting: false,
  });

  const renderRowLink = useCallback<RenderRowLink<ChangeNode>>(
    (row, props) =>
      row.original.href ? (
        <Link to={row.original.href} {...props} />
      ) : (
        props.children
      ),
    [],
  );

  return (
    <TitleSection
      label={t`Changes to push`}
      description={t`Content in this worktree that differs from the ${branch} branch.`}
      data-testid="worktree-changes"
    >
      {error != null ? (
        <LoadingAndErrorWrapper error={error} />
      ) : isLoading || isLoadingGroups ? (
        <TreeTableSkeleton columnWidths={[0.8, 0.2]} />
      ) : (
        <TreeTable
          instance={treeTableInstance}
          emptyState={<ListEmptyState label={t`Everything is in sync`} />}
          renderRowLink={renderRowLink}
          getRowProps={getRowProps}
          ariaLabel={t`Changes to push`}
        />
      )}
    </TitleSection>
  );
}

type BuildContext = {
  worktreeId: WorktreeId;
  collectionMap: Map<number, Collection>;
  getIcon: ReturnType<typeof useGetIcon>;
};

function buildChangeTree(
  groups: CollectionGroup[],
  context: BuildContext,
): ChangeNode[] {
  return groups.map((group, index) => ({
    id: `group-${group.collectionId ?? "root"}-${index}`,
    kind: "group",
    name: group.pathSegments.map((segment) => segment.name).join(" / "),
    icon: getGroupIcon(group.spec),
    entity: group.collectionEntity ?? null,
    href: null,
    children: [
      ...group.tableGroups.map((tableGroup) =>
        buildTableNode(tableGroup, context),
      ),
      ...group.items.map((entity) => buildEntityNode(entity, context)),
    ],
  }));
}

function buildTableNode(
  tableGroup: TableGroup,
  context: BuildContext,
): ChangeNode {
  const children = tableGroup.children.map((child) =>
    buildEntityNode(child, context),
  );
  if (tableGroup.table != null) {
    return { ...buildEntityNode(tableGroup.table, context), children };
  }
  return {
    id: `table-group-${tableGroup.tableId}`,
    kind: "table",
    name: tableGroup.tableName,
    icon: "table",
    entity: null,
    href: null,
    children,
  };
}

function buildEntityNode(
  entity: RemoteSyncEntity,
  { worktreeId, collectionMap, getIcon }: BuildContext,
): ChangeNode {
  const isRemoved =
    entity.sync_status === "delete" || entity.sync_status === "removed";
  return {
    id: `${entity.model}-${entity.id}`,
    kind: "entity",
    name: entity.name,
    icon: getEntityIcon(entity, getIcon),
    entity,
    // A removed entity has no page left to open.
    href: isRemoved
      ? null
      : getWorktreeEntityUrl(entity, worktreeId, collectionMap),
  };
}
