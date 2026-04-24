import type { ExpandedState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useBuildSnippetTree } from "metabase/data-studio/common/hooks/use-build-snippet-tree";
import type {
  EmptyStateData,
  TreeItem,
} from "metabase/data-studio/common/types";
import {
  isCollection,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import { LibraryUpsellPage } from "metabase/data-studio/upsells/pages";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useRouter } from "metabase/router";
import {
  Anchor,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Collection, CollectionId } from "metabase-types/api";

import { LibraryEmptyState } from "../components/LibraryEmptyState";

import { CreateMenu } from "./CreateMenu";
import { PublishTableModal } from "./PublishTableModal";
import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";
import {
  useErrorHandling,
  useLibraryCollectionTree,
  useLibrarySearch,
} from "./hooks";
import { getAccessibleCollection, getWritableCollection } from "./utils";

interface EmptyStateActionProps {
  data: EmptyStateData;
  onPublishTable: () => void;
}

function EmptyStateAction({ data, onPublishTable }: EmptyStateActionProps) {
  if (data.sectionType === "data") {
    return (
      <Anchor
        component="button"
        type="button"
        fz="inherit"
        onClick={(e) => {
          e.stopPropagation();
          onPublishTable();
        }}
      >
        {data.actionLabel}
      </Anchor>
    );
  }

  if (data.actionUrl) {
    return (
      <Anchor
        component={ForwardRefLink}
        to={data.actionUrl}
        fz="inherit"
        onClick={(e) => e.stopPropagation()}
      >
        {data.actionLabel}
      </Anchor>
    );
  }

  return null;
}

export function LibraryPage() {
  const hasLibraryFeature = useHasTokenFeature("library");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibraryPageContent />;
}

function LibraryPageContent() {
  const { location } = useRouter();
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [permissionsCollectionId, setPermissionsCollectionId] =
    useState<CollectionId | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPublishTableModalOpen, setIsPublishTableModalOpen] = useState(false);
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

  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    });

  const libraryCollection = useMemo(
    () => collections.find(isLibraryCollection),
    [collections],
  );

  const tableCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-data"),
    [libraryCollection],
  );

  const metricCollection = useMemo(
    () =>
      libraryCollection &&
      getAccessibleCollection(libraryCollection, "library-metrics"),
    [libraryCollection],
  );

  const writableMetricCollection = useMemo(
    () =>
      libraryCollection &&
      getWritableCollection(libraryCollection, "library-metrics"),
    [libraryCollection],
  );

  const getItemHref = useCallback((item: TreeItem): string | null => {
    if (item.model === "empty-state" || isEmptyStateData(item.data)) {
      return null;
    }
    const entityId = item.data.id as number;
    if (item.model === "metric") {
      return Urls.dataStudioMetric(entityId);
    }
    if (item.model === "snippet") {
      return Urls.dataStudioSnippet(entityId);
    }
    if (item.model === "table") {
      return Urls.dataStudioTable(entityId);
    }
    return null;
  }, []);
  const {
    tree: tablesTree,
    isLoading: loadingTables,
    error: tablesError,
    watchRows: watchTableRows,
    isChildrenLoading: isTableChildrenLoading,
  } = useLibraryCollectionTree(tableCollection, "data");
  const {
    tree: metricsTree,
    isLoading: loadingMetrics,
    error: metricsError,
    watchRows: watchMetricRows,
    isChildrenLoading: isMetricChildrenLoading,
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
                    onPublishTable={() => setIsPublishTableModalOpen(true)}
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
          const { data } = row.original;
          if (isEmptyStateData(data)) {
            return null;
          }
          if (
            isCollection(data) &&
            data.model === "collection" &&
            data.namespace === "snippets"
          ) {
            if (data.id === "root") {
              return (
                <RootSnippetsCollectionMenu
                  setPermissionsCollectionId={setPermissionsCollectionId}
                />
              );
            } else {
              return (
                <PLUGIN_SNIPPET_FOLDERS.CollectionMenu
                  collection={data}
                  onEditDetails={setEditingCollection}
                  onChangePermissions={setPermissionsCollectionId}
                />
              );
            }
          }

          return null;
        },
      },
    ],
    [setIsPublishTableModalOpen, isRemoteSyncReadOnly],
  );

  const getRowHref = useCallback(
    (row: { original: TreeItem }) => getItemHref(row.original),
    [getItemHref],
  );

  // Controlled expansion: expand all during search, preserve user state when browsing.
  // Default any IDs from the URL. If none are provided, default to Data and Metrics expanded
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
    return ids;
  }, [tableCollection, metricCollection, expandedIdsFromUrl]);

  const [browseExpanded, setBrowseExpanded] = useState<ExpandedState | null>(
    null,
  );

  // Initialize browseExpanded from defaultExpanded once collections are loaded,
  // so we stop falling through to a recalculated defaultExpanded on every render.
  useEffect(() => {
    if (browseExpanded === null && Object.keys(defaultExpanded).length > 0) {
      setBrowseExpanded(defaultExpanded);
    }
  }, [browseExpanded, defaultExpanded]);

  const expanded = isSearchActive ? true : (browseExpanded ?? {});
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

  return (
    <>
      <SectionLayout>
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Library`}</DataStudioBreadcrumbs>
          }
          px="3.5rem"
          py={0}
        />
        <Stack
          bg="background-secondary"
          data-testid="library-page"
          pb="2rem"
          px="3.5rem"
          style={{ overflow: "hidden" }}
        >
          {!libraryCollection && !isLoadingCollections ? (
            <LibraryEmptyState />
          ) : (
            <>
              <Flex gap="md">
                <TextInput
                  placeholder={t`Search...`}
                  leftSection={<Icon name="search" />}
                  bdrs="md"
                  flex="1"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <CreateMenu
                  metricCollectionId={writableMetricCollection?.id}
                  canWriteToMetricCollection={!!writableMetricCollection}
                  dataCollectionId={tableCollection?.id}
                  canWriteToDataCollection={!!tableCollection?.can_write}
                />
              </Flex>
              <Card withBorder p={0}>
                {isLoading ? (
                  <TreeTableSkeleton columnWidths={[0.6, 0.2, 0.05]} />
                ) : (
                  <TreeTable
                    instance={treeTableInstance}
                    emptyState={
                      emptyMessage ? (
                        <ListEmptyState label={emptyMessage} />
                      ) : null
                    }
                    onRowClick={(row) => {
                      if (row.original.model === "empty-state") {
                        return;
                      }
                      if (row.getCanExpand()) {
                        row.toggleExpanded();
                      }
                      // Navigation for leaf nodes is handled by the link
                    }}
                    getRowHref={getRowHref}
                    isChildrenLoading={isChildrenLoading}
                  />
                )}
              </Card>
            </>
          )}
        </Stack>
      </SectionLayout>
      {editingCollection && (
        <PLUGIN_SNIPPET_FOLDERS.CollectionFormModal
          collection={editingCollection}
          onClose={() => setEditingCollection(null)}
          onSaved={() => setEditingCollection(null)}
        />
      )}
      {permissionsCollectionId !== null && (
        <PLUGIN_SNIPPET_FOLDERS.CollectionPermissionsModal
          collectionId={permissionsCollectionId}
          onClose={() => setPermissionsCollectionId(null)}
        />
      )}
      <PublishTableModal
        opened={isPublishTableModalOpen}
        onClose={() => setIsPublishTableModalOpen(false)}
        onPublished={() => setIsPublishTableModalOpen(false)}
      />
    </>
  );
}
