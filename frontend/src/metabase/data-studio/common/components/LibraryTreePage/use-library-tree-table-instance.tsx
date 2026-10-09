import type { ExpandedState, Row } from "@tanstack/react-table";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import type {
  LibrarySectionType,
  TreeItem,
} from "metabase/data-studio/common/types";
import {
  getTreeRowHref,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useSearchParams } from "metabase/router";
import {
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Text,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";

import { EmptyStateAction } from "./EmptyStateAction";

type Params = {
  tree: TreeItem[];
  isLoading: boolean;
  isSearchActive: boolean;
  searchQuery: string;
  emptyMessage: string;
  defaultExpandedIds: string[];
  renderRowMenu: (item: TreeItem) => ReactNode;
  emptyStateActions?: Partial<Record<LibrarySectionType, () => void>>;
};

export function useLibraryTreeTableInstance({
  tree,
  isLoading,
  isSearchActive,
  searchQuery,
  emptyMessage,
  defaultExpandedIds,
  renderRowMenu,
  emptyStateActions,
}: Params) {
  const [searchParams] = useSearchParams();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const columns = useMemo<TreeTableColumnDef<TreeItem>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        enableSorting: true,
        accessorKey: "name",
        minWidth: 200,
        cell: ({ row }) => {
          const { data } = row.original;

          if (isEmptyStateData(data)) {
            return (
              <Flex align="center" gap="0.25rem" data-testid="empty-state-row">
                <Text c="text-disabled" fz="inherit">
                  {data.description}
                </Text>
                {!isRemoteSyncReadOnly && (
                  <EmptyStateAction
                    data={data}
                    onClick={emptyStateActions?.[data.sectionType]}
                  />
                )}
              </Flex>
            );
          }

          const nameCell = (
            <EntityNameCell
              data-testid={`${row.original.model}-name`}
              icon={row.original.icon}
              name={
                row.original.parentCollectionName ? (
                  <Group gap="sm" miw={0} align="center">
                    <Text truncate>{row.original.name}</Text>
                    <Group gap="xxs">
                      <Icon name="collection" size={12} c="text-disabled" />
                      <Text fz="xs" c="text-disabled" truncate>
                        {row.original.parentCollectionName}
                      </Text>
                    </Group>
                  </Group>
                ) : (
                  row.original.name
                )
              }
            />
          );

          const href = getTreeRowHref(row);
          if (href === null) {
            return nameCell;
          }
          return (
            <Link
              to={href}
              style={{
                display: "flex",
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {nameCell}
            </Link>
          );
        },
      },
      {
        id: "updatedAt",
        header: t`Updated At`,
        accessorKey: "updatedAt",
        enableSorting: true,
        sortingFn: "datetime",
        width: "auto",
        widthPadding: 20,
        cell: ({ row, getValue }) => {
          if (row.original.model === "empty-state") {
            return null;
          }
          // Unjustified type cast. FIXME
          const dateValue = getValue() as string | undefined;
          return dateValue ? <DateTime value={dateValue} /> : null;
        },
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => renderRowMenu(row.original),
      },
    ],
    [isRemoteSyncReadOnly, emptyStateActions, renderRowMenu],
  );

  // Section roots and any IDs from the URL start expanded
  const defaultExpanded = useMemo<ExpandedState>(
    () =>
      Object.fromEntries([
        ...defaultExpandedIds.map((id) => [id, true]),
        ...searchParams
          .getAll("expandedId")
          .map((id) => [`collection:${id}`, true]),
      ]),
    [defaultExpandedIds, searchParams],
  );

  const [browseExpanded, setBrowseExpanded] = useState<ExpandedState | null>(
    null,
  );

  // Lock browseExpanded once loading settles, so later refetches keep the user's expansion
  useEffect(() => {
    if (
      browseExpanded === null &&
      !isLoading &&
      Object.keys(defaultExpanded).length > 0
    ) {
      setBrowseExpanded(defaultExpanded);
    }
  }, [browseExpanded, defaultExpanded, isLoading]);

  // Controlled expansion: expand all during search, preserve user state when browsing
  const expanded = isSearchActive ? true : (browseExpanded ?? defaultExpanded);
  const onExpandedChange = useCallback(
    (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      if (!isSearchActive) {
        setBrowseExpanded((prev) => {
          const current = prev ?? defaultExpanded;
          return typeof updater === "function" ? updater(current) : updater;
        });
      }
    },
    [isSearchActive, defaultExpanded],
  );

  const treeTableInstance = useTreeTableInstance({
    data: tree,
    columns,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    getRowCanExpand,
    expanded,
    onExpandedChange,
    isFilterable: (node) =>
      node.model !== "collection" && node.model !== "empty-state",
  });

  const allRows = treeTableInstance.table.getCoreRowModel().flatRows;

  return {
    treeTableInstance,
    allRows,
    emptyMessage: searchQuery
      ? t`No results for "${searchQuery}"`
      : emptyMessage,
  };
}

function getRowCanExpand(row: Row<TreeItem>) {
  const { model, data, children } = row.original;
  if (model !== "collection") {
    return false;
  }
  if (row.original.childrenLoaded) {
    return children != null && children.length > 0;
  }
  // Already has children populated
  if (children && children.length > 0) {
    return true;
  }
  // Not loaded yet — check here/below from the API to know if expandable
  if (!isEmptyStateData(data) && "here" in data) {
    // Unjustified type cast. FIXME
    const item = data as { here?: string[]; below?: string[] };
    return (
      (item.here != null && item.here.length > 0) ||
      (item.below != null && item.below.length > 0)
    );
  }
  return false;
}
