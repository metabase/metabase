import type { ExpandedState, Row } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  type LibraryHierarchyKind,
  getHierarchyDatabaseSchemaExpandSignature,
  getHierarchyDatabaseSchemaExpandedIds,
  useLibrarySegmentsMeasuresTree,
} from "./useLibrarySegmentsMeasuresTree";

type Params = {
  collections: Collection[];
  isLoadingCollections: boolean;
  searchQuery: string;
  onPublishTableClick: VoidFunction;
};

const EMPTY_SNIPPET_TREE: TreeItem[] = [];
const EMPTY_TREE: TreeItem[] = [];

function filterSectionTree(tree: TreeItem[]) {
  return tree.filter((node) => node.model !== "empty-state");
}

function unwrapLibrarySectionRoot(tree: TreeItem[]) {
  return filterSectionTree(tree.flatMap((node) => node.children ?? []));
}

function getExpandedRowSignature<T>(rows: Row<T>[]) {
  return rows
    .filter((row) => row.getIsExpanded())
    .map((row) => row.id)
    .sort()
    .join("|");
}

export function useLibraryTreeTableInstance({
  collections,
  isLoadingCollections,
  searchQuery,
  onPublishTableClick,
}: Params) {
  const { location } = useRouter();
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

  const sectionFilter = location.query?.library;
  const isSectionFiltered = sectionFilter != null;
  const hierarchyKind: LibraryHierarchyKind | null =
    sectionFilter === "segments" || sectionFilter === "measures"
      ? sectionFilter
      : null;
  const isHierarchyView = hierarchyKind != null;
  const needsTableTree = !isSectionFiltered || sectionFilter === "tables";
  const needsMetricTree = !isSectionFiltered || sectionFilter === "metrics";
  const needsSnippets = !isSectionFiltered;

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
  } = useLibraryCollectionTree(
    needsTableTree ? tableCollection : undefined,
    "data",
  );
  const {
    tree: metricsTree,
    isLoading: loadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
    refreshCollections: refreshMetricCollections,
  } = useLibraryCollectionTree(
    needsMetricTree ? metricCollection : undefined,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: snippetTree,
    isLoading: loadingSnippets,
    error: snippetsError,
  } = useBuildSnippetTree();

  const activeSnippetTree = needsSnippets ? snippetTree : EMPTY_SNIPPET_TREE;

  const {
    tree: searchTree,
    isActive: isSearchActive,
    isLoading: isSearchLoading,
  } = useLibrarySearch(
    needsSnippets || sectionFilter === "tables" || sectionFilter === "metrics"
      ? searchQuery
      : "",
    libraryCollection?.id,
    activeSnippetTree,
  );

  const {
    tree: hierarchyTree,
    isLoading: loadingHierarchy,
    rawItemCount,
  } = useLibrarySegmentsMeasuresTree(hierarchyKind);

  const combinedTree = useMemo(() => {
    if (isHierarchyView) {
      return hierarchyTree.length > 0 ? hierarchyTree : EMPTY_TREE;
    }
    if (isSearchActive) {
      return searchTree;
    }
    if (sectionFilter === "tables") {
      return unwrapLibrarySectionRoot(tablesTree);
    }
    if (sectionFilter === "metrics") {
      return unwrapLibrarySectionRoot(metricsTree);
    }
    return [...tablesTree, ...metricsTree, ...activeSnippetTree];
  }, [
    isHierarchyView,
    hierarchyTree,
    isSearchActive,
    sectionFilter,
    searchTree,
    tablesTree,
    metricsTree,
    activeSnippetTree,
  ]);

  const isLoading = isHierarchyView
    ? loadingHierarchy
    : sectionFilter === "tables"
      ? isLoadingCollections || loadingTables || isSearchLoading
      : sectionFilter === "metrics"
        ? isLoadingCollections || loadingMetrics || isSearchLoading
        : isLoadingCollections ||
          loadingTables ||
          loadingMetrics ||
          loadingSnippets ||
          isSearchLoading;

  useErrorHandling(tablesError || metricsError || snippetsError);

  const libraryHasContent = useMemo(() => {
    if (isHierarchyView) {
      return hierarchyTree.length > 0;
    }
    if (sectionFilter === "tables" || sectionFilter === "metrics") {
      return combinedTree.length > 0;
    }
    return combinedTree.some(
      (node) =>
        node.children &&
        node.children.length > 0 &&
        node.children.some((child) => child.model !== "empty-state"),
    );
  }, [combinedTree, hierarchyTree, isHierarchyView, sectionFilter]);

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
        cell: ({ row }) => {
          if (isHierarchyView) {
            return null;
          }
          if (
            row.original.model === "segment" ||
            row.original.model === "measure"
          ) {
            return null;
          }
          return (
            <ActionCell
              treeItem={row.original}
              refreshMetricCollections={refreshMetricCollections}
              refreshTableCollections={refreshTableCollections}
            />
          );
        },
      },
    ],
    [
      isHierarchyView,
      isRemoteSyncReadOnly,
      onPublishTableClick,
      refreshMetricCollections,
      refreshTableCollections,
    ],
  );

  const getSubRows = useCallback((node: TreeItem) => node.children, []);
  const getNodeId = useCallback((node: TreeItem) => node.id, []);

  const getRowCanExpand = useCallback(
    (row: Row<TreeItem>) => {
      const { model, data, children } = row.original;
      if (isHierarchyView) {
        return (children?.length ?? 0) > 0;
      }
      if (model !== "collection") {
        return false;
      }
      if (row.original.childrenLoaded) {
        return children != null && children.length > 0;
      }
      if (children && children.length > 0) {
        return true;
      }
      if (!isEmptyStateData(data) && "here" in data) {
        const item = data as { here?: string[]; below?: string[] };
        return (
          (item.here != null && item.here.length > 0) ||
          (item.below != null && item.below.length > 0)
        );
      }
      return false;
    },
    [isHierarchyView],
  );

  const isFilterable = useCallback(
    (node: TreeItem) =>
      node.model !== "collection" && node.model !== "empty-state",
    [],
  );

  const snippetRootId = needsSnippets ? snippetTree[0]?.id : undefined;

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
  const [hierarchyExpanded, setHierarchyExpanded] = useState<ExpandedState>({});
  const lastExpandedSignatureRef = useRef<string | null>(null);
  const hierarchyExpansionInitSigRef = useRef<string | null>(null);

  useEffect(() => {
    setBrowseExpanded(null);
    setHierarchyExpanded({});
    lastExpandedSignatureRef.current = null;
    hierarchyExpansionInitSigRef.current = null;
  }, [sectionFilter]);

  useEffect(() => {
    if (isSectionFiltered || browseExpanded !== null || isLoading) {
      return;
    }
    setBrowseExpanded(defaultExpanded);
  }, [isSectionFiltered, browseExpanded, defaultExpanded, isLoading]);

  const expanded = isSearchActive ? true : (browseExpanded ?? defaultExpanded);
  const onExpandedChange = useCallback(
    (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      if (isSearchActive) {
        return;
      }
      if (!isSectionFiltered) {
        setBrowseExpanded((prev) => {
          const current = prev ?? defaultExpanded;
          return typeof updater === "function" ? updater(current) : updater;
        });
      }
    },
    [isSearchActive, isSectionFiltered, defaultExpanded],
  );

  const useControlledExpansion = isSearchActive || !isSectionFiltered;
  const isHierarchyExpandView =
    hierarchyKind === "segments" || hierarchyKind === "measures";

  const hierarchyExpandSignature = useMemo(() => {
    if (!isHierarchyExpandView || hierarchyTree.length === 0) {
      return null;
    }
    return getHierarchyDatabaseSchemaExpandSignature(hierarchyTree);
  }, [isHierarchyExpandView, hierarchyTree]);

  // Seed db/schema expansion once per tree structure. Do not use
  // defaultExpanded — its merge effect re-applies schema ids on every change
  // and fights user collapse/expand toggles.
  useEffect(() => {
    if (!isHierarchyExpandView || hierarchyExpandSignature == null) {
      return;
    }
    if (hierarchyExpansionInitSigRef.current === hierarchyExpandSignature) {
      return;
    }
    hierarchyExpansionInitSigRef.current = hierarchyExpandSignature;
    const dbSchemaIds = getHierarchyDatabaseSchemaExpandedIds(hierarchyTree);
    setHierarchyExpanded((prev) => ({
      ...(typeof prev === "object" && prev !== null && prev !== true
        ? prev
        : {}),
      ...dbSchemaIds,
    }));
  }, [isHierarchyExpandView, hierarchyExpandSignature, hierarchyTree]);

  const onHierarchyExpandedChange = useCallback(
    (updater: ExpandedState | ((old: ExpandedState) => ExpandedState)) => {
      setHierarchyExpanded(updater);
    },
    [],
  );

  const treeTableInstance = useTreeTableInstance({
    data: combinedTree,
    columns: libraryColumnDef,
    getSubRows,
    getNodeId,
    getRowCanExpand,
    isFilterable,
    ...(isHierarchyExpandView
      ? {
          expanded: hierarchyExpanded,
          onExpandedChange: onHierarchyExpandedChange,
        }
      : useControlledExpansion
        ? {
            expanded,
            onExpandedChange,
          }
        : {}),
  });

  useEffect(() => {
    if (isHierarchyView) {
      return;
    }

    const signature = getExpandedRowSignature(treeTableInstance.rows);
    if (signature === lastExpandedSignatureRef.current) {
      return;
    }
    lastExpandedSignatureRef.current = signature;

    const rows = treeTableInstance.rows;
    if (needsTableTree) {
      watchTableRows(rows);
    }
    if (needsMetricTree) {
      watchMetricRows(rows);
    }
  }, [
    isHierarchyView,
    needsTableTree,
    needsMetricTree,
    treeTableInstance.rows,
    watchTableRows,
    watchMetricRows,
  ]);

  const isChildrenLoading = useCallback(
    (row: Parameters<typeof isTableChildrenLoading>[0]) => {
      if (sectionFilter === "metrics") {
        return isMetricChildrenLoading(row);
      }
      if (sectionFilter === "tables") {
        return isTableChildrenLoading(row);
      }
      return isTableChildrenLoading(row) || isMetricChildrenLoading(row);
    },
    [sectionFilter, isTableChildrenLoading, isMetricChildrenLoading],
  );

  let emptyMessage = null;
  if (!libraryHasContent && !isLoading) {
    if (sectionFilter === "tables") {
      emptyMessage = t`No published tables yet`;
    } else if (sectionFilter === "metrics") {
      emptyMessage = t`No metrics yet`;
    } else if (sectionFilter === "segments") {
      emptyMessage = rawItemCount === 0 ? t`No segments yet` : null;
    } else if (sectionFilter === "measures") {
      emptyMessage = rawItemCount === 0 ? t`No measures yet` : null;
    } else {
      emptyMessage = t`No tables, metrics, or snippets yet`;
    }
  } else if (searchQuery && !isHierarchyView) {
    emptyMessage = t`No results for "${searchQuery}"`;
  }

  return {
    treeTableInstance,
    isChildrenLoading,
    isLoading,
    emptyMessage,
  };
}
