import { useCallback, useMemo, useState } from "react";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import DateTime from "metabase/common/components/DateTime";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { useRouter } from "metabase/router";
import {
  Card,
  EntityNameCell,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { CreateLibraryModal } from "metabase-enterprise/data-studio/common/components/CreateLibraryModal";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { ExpandedState } from "metabase-enterprise/data-studio/data-model/components/TablePicker/types";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import type { Collection, CollectionId } from "metabase-types/api";

import { SectionLayout } from "../../components/SectionLayout";

import { CreateMenu } from "./CreateMenu";
import { RootSnippetsCollectionMenu } from "./RootSnippetsCollectionMenu";
import {
  useBuildSnippetTree,
  useBuildTreeForCollection,
  useErrorHandling,
} from "./hooks";
import { type TreeItem, isCollection } from "./types";
import { getAccessibleCollection, getWritableCollection } from "./utils";

export function LibrarySectionLayout() {
  usePageTitle(t`Library`);
  const dispatch = useDispatch();
  const { location } = useRouter();
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [permissionsCollectionId, setPermissionsCollectionId] =
    useState<CollectionId | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleItemSelect = useCallback(
    (item: TreeItem) => {
      const entityId = item.data.id as number;
      if (item.model === "metric") {
        dispatch(push(Urls.dataStudioMetric(entityId)));
      } else if (item.model === "snippet") {
        dispatch(push(Urls.dataStudioSnippet(entityId)));
      } else if (item.model === "table") {
        dispatch(push(Urls.dataStudioTable(entityId)));
      }
    },
    [dispatch],
  );
  const {
    tree: tablesTree,
    isLoading: loadingTables,
    error: tablesError,
  } = useBuildTreeForCollection(tableCollection);
  const {
    tree: metricsTree,
    isLoading: loadingMetrics,
    error: metricsError,
  } = useBuildTreeForCollection(metricCollection);
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

  const libraryHasContent = useMemo(
    () =>
      combinedTree.some((node) => node.children && node.children.length > 0),
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
        cell: ({ row }) => (
          <EntityNameCell
            data-testid={`${row.original.model}-name`}
            icon={row.original.icon}
            name={row.original.name}
          />
        ),
      },
      {
        id: "updatedAt",
        header: t`Updated At`,
        accessorKey: "updatedAt",
        enableSorting: true,
        sortingFn: "datetime",
        width: "auto",
        widthPadding: 20,
        cell: ({ getValue }) => {
          const dateValue = getValue() as string | undefined;
          return dateValue ? <DateTime value={dateValue} /> : null;
        },
      },
      {
        id: "actions",
        width: 48,
        cell: ({ row }) => {
          const { data } = row.original;
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
    [],
  );

  const handleRowActivate = useCallback(
    (row: { original: TreeItem }) => {
      handleItemSelect(row.original);
    },
    [handleItemSelect],
  );

  const treeTableInstance = useTreeTableInstance({
    data: combinedTree,
    columns: libraryColumnDef,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    globalFilter: searchQuery,
    onGlobalFilterChange: setSearchQuery,
    isFilterable: (node) => node.model !== "collection",
    defaultExpanded: expandedIdsFromUrl ?? true,
    onRowActivate: handleRowActivate,
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
          <Flex gap="md">
            <TextInput
              placeholder={t`Search...`}
              leftSection={<Icon name="search" />}
              bdrs="md"
              flex="1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <CreateMenu metricCollectionId={writableMetricCollection?.id} />
          </Flex>
          <Card withBorder p={0}>
            {isLoading ? (
              <TreeTableSkeleton columnWidths={[0.6, 0.2, 0.05]} />
            ) : (
              <TreeTable
                instance={treeTableInstance}
                emptyState={
                  emptyMessage ? <ListEmptyState label={emptyMessage} /> : null
                }
                onRowClick={(row) => {
                  if (row.getCanExpand()) {
                    row.toggleExpanded();
                  } else {
                    handleRowActivate(row);
                  }
                }}
              />
            )}
          </Card>
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
      <CreateLibraryModal
        isOpened={!isLoadingCollections && !libraryCollection}
        onClose={() => {
          dispatch(goBack());
        }}
      />
    </>
  );
}
