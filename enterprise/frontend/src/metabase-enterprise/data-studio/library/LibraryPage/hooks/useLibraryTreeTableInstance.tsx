import type { ExpandedState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { DateTime } from "metabase/common/components/DateTime";
import { useBuildSnippetTree } from "metabase/data-studio/common/hooks/use-build-snippet-tree";
import type { TreeItem } from "metabase/data-studio/common/types";
import { isEmptyStateData } from "metabase/data-studio/common/utils";
import { useSelector } from "metabase/redux";
import { useRouter } from "metabase/router";
import {
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Text,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Collection } from "metabase-types/api";

import { ActionCell } from "../components/ActionCell";
import { EmptyStateAction } from "../components/EmptyStateAction";

import { useErrorHandling } from "./useErrorHandling";
import { useLibraryCollectionTree } from "./useLibraryCollectionTree";
import { useLibraryCollections } from "./useLibraryCollections";
import { useLibrarySearch } from "./useLibrarySearch";

type Params = {
  collections: Collection[];
  searchQuery: string;
  onPublishTableClick: VoidFunction;
};

export function useLibraryTreeTableInstance({
  collections,
  searchQuery,
  onPublishTableClick,
}: Params) {
  const { location } = useRouter();
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const expandedIdsFromUrl = useMemo(() => {
    const rawIds = location.query?.expandedId;
    if (!rawIds) {
      return null;
    }

    const ids = Array.isArray(rawIds) ? rawIds : [rawIds];
    return _.object(
      ids.map((id) => [`collection:${id}`, true]),
    ) as ExpandedState;
  }, [location.query?.expandedId]);
  const { libraryCollection, tableCollection, metricCollection } =
    useLibraryCollections(collections);

  const {
    tree: tablesTree,
    isLoading: loadingTables,
    error: tablesError,
    watchRows: watchTableRows,
    isChildrenLoading: isTableChildrenLoading,
    refreshCollections: refreshTableCollections,
  } = useLibraryCollectionTree(tableCollection, "data");
  const {
    tree: metricsTree,
    isLoading: loadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
    refreshCollections: refreshMetricCollections,
  } = useLibraryCollectionTree(
    metricCollection,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: snippetTree,
    isLoading: loadingSnippets,
    error: snippetsError,
  } = useBuildSnippetTree();

  // Server-side search for tables and metrics, client-side for snippets
  const {
    tree: searchTree,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
  } = useLibrarySearch(searchQuery, libraryCollection?.id, snippetTree);

  const combinedTree = useMemo(
    () =>
      isSearchActive
        ? searchTree
        : [...tablesTree, ...metricsTree, ...snippetTree],
    [isSearchActive, searchTree, tablesTree, metricsTree, snippetTree],
  );

  const isLoading =
    loadingTables || loadingMetrics || loadingSnippets || isSearchLoading;
  useErrorHandling(tablesError || metricsError || snippetsError);

  const libraryHasContent = useMemo(
    () =>
      combinedTree.some(
        (node) =>
          node.children &&
          node.children.length > 0 &&
          node.children.some((child) => child.model !== "empty-state"),
      ),
    [combinedTree],
  );

  const libraryColumnDef = useMemo<TreeTableColumnDef<TreeItem>[]>(
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
                <Text c="text-tertiary" fz="inherit">
                  {data.description}
                </Text>
                {!isRemoteSyncReadOnly && (
                  <EmptyStateAction
                    data={data}
                    onPublishTableClick={onPublishTableClick}
                  />
                )}
              </Flex>
            );
          }

          return (
            <EntityNameCell
              data-testid={`${row.original.model}-name`}
              icon={row.original.icon}
              name={
                row.original.parentCollectionName ? (
                  <Group gap="sm" miw={0} align="center">
                    <Text truncate>{row.original.name}</Text>
                    <Group gap="xs">
                      <Icon name="collection" size={12} c="text-tertiary" />
                      <Text fz="xs" c="text-tertiary" truncate>
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
          const dateValue = getValue() as string | undefined;
          return dateValue ? <DateTime value={dateValue} /> : null;
        },
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => (
          <ActionCell
            treeItem={row.original}
            refreshMetricCollections={refreshMetricCollections}
            refreshTableCollections={refreshTableCollections}
          />
        ),
      },
    ],
    [
      isRemoteSyncReadOnly,
      onPublishTableClick,
      refreshMetricCollections,
      refreshTableCollections,
    ],
  );

  const snippetRootId = snippetTree[0]?.id;

  // Controlled expansion: expand all during search, preserve user state when browsing.
  // Default any IDs from the URL. If none are provided, default to Data, Metrics and SQL Snippets expanded
  const defaultExpanded = useMemo<ExpandedState>(() => {
    if (expandedIdsFromUrl) {
      return expandedIdsFromUrl;
    }
    const ids: ExpandedState = {};
    if (tableCollection) {
      ids[`collection:${tableCollection.id}`] = true;
    }
    if (metricCollection) {
      ids[`collection:${metricCollection.id}`] = true;
    }

    if (snippetRootId) {
      ids[snippetRootId] = true;
    }

    return ids;
  }, [expandedIdsFromUrl, tableCollection, metricCollection, snippetRootId]);

  const [browseExpanded, setBrowseExpanded] = useState<ExpandedState | null>(
    null,
  );

  // Initialize browseExpanded from defaultExpanded once collections are loaded,
  // so we stop falling through to a recalculated defaultExpanded on every render.
  useEffect(() => {
    if (
      browseExpanded === null &&
      !isLoading &&
      Object.keys(defaultExpanded).length > 0
    ) {
      setBrowseExpanded(defaultExpanded);
    }
  }, [browseExpanded, defaultExpanded, isLoading]);

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
    data: combinedTree,
    columns: libraryColumnDef,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    getRowCanExpand: (row) => {
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
        const item = data as { here?: string[]; below?: string[] };
        return (
          (item.here != null && item.here.length > 0) ||
          (item.below != null && item.below.length > 0)
        );
      }
      return false;
    },
    expanded,
    onExpandedChange,
    isFilterable: (node) =>
      node.model !== "collection" && node.model !== "empty-state",
  });

  // Lazy-load subcollection items when expanded
  useEffect(() => {
    watchTableRows(treeTableInstance.rows);
    watchMetricRows(treeTableInstance.rows);
  }, [treeTableInstance.rows, watchTableRows, watchMetricRows]);

  const isChildrenLoading = useCallback(
    (row: Parameters<typeof isTableChildrenLoading>[0]) =>
      isTableChildrenLoading(row) || isMetricChildrenLoading(row),
    [isTableChildrenLoading, isMetricChildrenLoading],
  );

  let emptyMessage = null;
  if (!libraryHasContent) {
    emptyMessage = t`No tables, metrics, or snippets yet`;
  } else if (searchQuery) {
    emptyMessage = t`No results for "${searchQuery}"`;
  }

  return {
    treeTableInstance,
    isChildrenLoading,
    isLoading,
    emptyMessage,
  };
}
