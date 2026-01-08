import { useCallback, useMemo, useState } from "react";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import DateTime from "metabase/common/components/DateTime";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Button,
  Card,
  EntityNameCell,
  FixedSizeIcon,
  Flex,
  Icon,
  Menu,
  Stack,
  TextInput,
  TreeTable,
  TreeTableSkeleton,
  useTreeTableInstance,
} from "metabase/ui";
import { CreateLibraryModal } from "metabase-enterprise/data-studio/common/components/CreateLibraryModal";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import type { Collection, CollectionId } from "metabase-types/api";

import { SectionLayout } from "../../components/SectionLayout";

import { CreateMenu } from "./CreateMenu";
import {
  useBuildSnippetTree,
  useBuildTreeForCollection,
  useErrorHandling,
} from "./hooks";
import { type TreeItem, isCollection } from "./types";
import { getCollection, getWritableCollection } from "./utils";

export function LibrarySectionLayout() {
  usePageTitle(t`Library`);
  const dispatch = useDispatch();
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [permissionsCollectionId, setPermissionsCollectionId] =
    useState<CollectionId | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    });

  const libraryCollection = collections.find(isLibraryCollection);

  const tableCollection =
    libraryCollection && getCollection(libraryCollection, "library-data");

  const metricCollection =
    libraryCollection && getCollection(libraryCollection, "library-metrics");

  const writableMetricCollection =
    libraryCollection &&
    getWritableCollection(libraryCollection, "library-metrics");

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

  const libraryHasContent = combinedTree.some(
    (node) => node.children && node.children.length > 0,
  );

  const libraryColumnDef = useMemo<TreeTableColumnDef<TreeItem>[]>(
    () => [
      {
        id: "name",
        header: t`Name`,
        enableSorting: true,
        accessorKey: "name",
        minWidth: 600,
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
    defaultExpanded: true,
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

const RootSnippetsCollectionMenu = ({
  setPermissionsCollectionId,
}: {
  setPermissionsCollectionId: (id: CollectionId) => void;
}) => {
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
    return null;
  }

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          w={24}
          h={24}
          c="text-secondary"
          size="compact-xs"
          variant="subtle"
          leftSection={<FixedSizeIcon name="ellipsis" size={16} />}
          aria-label={t`Snippet collection options`}
          onClick={(e) => e.stopPropagation()}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FixedSizeIcon name="lock" />}
          onClick={(e) => {
            e.stopPropagation();
            setPermissionsCollectionId("root");
          }}
        >
          {t`Change permissions`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
