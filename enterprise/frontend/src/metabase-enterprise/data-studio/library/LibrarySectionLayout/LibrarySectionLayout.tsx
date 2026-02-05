import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import { DateTime } from "metabase/common/components/DateTime";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { SectionLayout } from "metabase/data-studio/app/components/SectionLayout";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import type { ExpandedState } from "metabase/data-studio/data-model/components/TablePicker/types";
import { LibraryUpsellPage } from "metabase/data-studio/upsells";
import { usePageTitle } from "metabase/hooks/use-page-title";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useRouter } from "metabase/router";
import { ListEmptyState } from "metabase/transforms/components/ListEmptyState";
import {
  Anchor,
  Card,
  EntityNameCell,
  Flex,
  Icon,
  Stack,
  Text,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { useBuildSnippetTree } from "metabase/data-studio/common/hooks/use-build-snippet-tree";
import type {
  EmptyStateData,
  TreeItem,
} from "metabase/data-studio/common/types";
import {
  isCollection,
  isEmptyStateData,
} from "metabase/data-studio/common/utils";
import type { Collection, CollectionId } from "metabase-types/api";

import { LibraryEmptyState } from "../components/LibraryEmptyState";

import { CreateMenu } from "./CreateMenu";
import { PublishTableModal } from "./PublishTableModal";
import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";
import { useBuildTreeForCollection, useErrorHandling } from "./hooks";
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

export function LibrarySectionLayout() {
  usePageTitle(t`Library`);
  const hasLibraryFeature = useHasTokenFeature("data_studio");

  if (!hasLibraryFeature) {
    return <LibraryUpsellPage />;
  }

  return <LibrarySectionContent />;
}

function LibrarySectionContent() {
  const { location } = useRouter();
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [permissionsCollectionId, setPermissionsCollectionId] =
    useState<CollectionId | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isPublishTableModalOpen, setIsPublishTableModalOpen] = useState(false);

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
  } = useBuildTreeForCollection(tableCollection, "data");
  const {
    tree: metricsTree,
    isLoading: loadingMetrics,
    error: metricsError,
  } = useBuildTreeForCollection(
    metricCollection,
    "metrics",
    metricCollection?.id,
  );
  const {
    tree: snippetTree,
    isLoading: loadingSnippets,
    error: snippetsError,
  } = useBuildSnippetTree();

  const combinedTree = useMemo(
    () => [...tablesTree, ...metricsTree, ...snippetTree],
    [tablesTree, metricsTree, snippetTree],
  );

  const isLoading = loadingTables || loadingMetrics || loadingSnippets;
  useErrorHandling(tablesError || metricsError || snippetsError);

  // Collections with only empty-state children should always be expanded
  // (even when navigating back via breadcrumbs which may collapse other sections)
  const alwaysExpandedIds = useMemo(() => {
    const ids: Record<string, boolean> = {};
    combinedTree.forEach((node) => {
      if (node.model === "collection" && node.children) {
        const hasOnlyEmptyState = node.children.every(
          (child) => child.model === "empty-state",
        );
        if (hasOnlyEmptyState) {
          ids[node.id] = true;
        }
      }
    });
    return ids;
  }, [combinedTree]);

  // Merge URL-based expansion with always-expanded empty sections
  const effectiveExpandedState = useMemo(() => {
    if (!expandedIdsFromUrl) {
      return true; // Expand all by default
    }
    return {
      ...expandedIdsFromUrl,
      ...alwaysExpandedIds,
    };
  }, [expandedIdsFromUrl, alwaysExpandedIds]);

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
                <EmptyStateAction
                  data={data}
                  onPublishTable={() => setIsPublishTableModalOpen(true)}
                />
              </Flex>
            );
          }

          return (
            <EntityNameCell
              data-testid={`${row.original.model}-name`}
              icon={row.original.icon}
              name={row.original.name}
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
    [setIsPublishTableModalOpen],
  );

  const getRowHref = useCallback(
    (row: { original: TreeItem }) => getItemHref(row.original),
    [getItemHref],
  );

  const treeTableInstance = useTreeTableInstance({
    data: combinedTree,
    columns: libraryColumnDef,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    isFilterable: (node) =>
      node.model !== "collection" && node.model !== "empty-state",
    defaultExpanded: effectiveExpandedState,
  });

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
