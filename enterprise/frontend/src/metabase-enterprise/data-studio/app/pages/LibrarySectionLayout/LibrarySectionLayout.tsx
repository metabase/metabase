import type { ColumnDef } from "@tanstack/react-table";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import DateTime from "metabase/common/components/DateTime";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import {
  Button,
  Card,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  TextInput,
} from "metabase/ui";
import { CreateLibraryModal } from "metabase-enterprise/data-studio/common/components/CreateLibraryModal";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import { useTreeFilter } from "metabase-enterprise/data-studio/common/components/Table/useTreeFilter";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";
import type { Collection, CollectionId } from "metabase-types/api";

import { SectionLayout } from "../../components/SectionLayout";

import { CreateMenu } from "./CreateMenu";
import {
  useBuildSnippetTree,
  useBuildTreeForCollection,
  useErrorHandling,
} from "./hooks";
import { type TreeItem, isCollection } from "./types";
import { getWritableCollection } from "./utils";

export function LibrarySectionLayout() {
  usePageTitle(t`Library`);
  const dispatch = useDispatch();
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null,
  );
  const [permissionsCollectionId, setPermissionsCollectionId] =
    useState<CollectionId | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>();

  const { data: collections = [], isLoading: isLoadingCollections } =
    useListCollectionsTreeQuery({
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    });

  const libraryCollection = collections.find(isLibraryCollection);

  const tableCollection =
    libraryCollection &&
    getWritableCollection(libraryCollection, "library-data");

  const metricCollection =
    libraryCollection &&
    getWritableCollection(libraryCollection, "library-metrics");

  const handleItemSelect = useCallback(
    (item: TreeItem) => {
      // Casting because these should not be collections, but collection items with
      // numbers for IDs
      if (item.model === "metric") {
        dispatch(push(Urls.dataStudioMetric(item.id as number)));
      } else if (item.model === "snippet") {
        dispatch(push(Urls.dataStudioSnippet(item.id as number)));
      } else if (item.model === "table") {
        dispatch(push(Urls.dataStudioTable(item.id as number)));
      }
    },
    [dispatch],
  );
  const {
    tree: tablesTree,
    hasChildren: hasTables,
    isLoading: loadingTables,
    error: tablesError,
  } = useBuildTreeForCollection(tableCollection);
  const {
    tree: metricsTree,
    hasChildren: hasMetrics,
    isLoading: loadingMetrics,
    error: metricsError,
  } = useBuildTreeForCollection(metricCollection);
  const {
    tree: snippetTree,
    hasChildren: hasSnippets,
    isLoading: loadingSnippets,
    error: snippetsError,
  } = useBuildSnippetTree();

  const filteredTree = useTreeFilter({
    data: [...tablesTree, ...metricsTree, ...snippetTree],
    searchQuery,
    searchProps: ["name"],
  });

  const libraryHasContent = hasTables || hasMetrics || hasSnippets;
  const isLoading = loadingTables || loadingMetrics || loadingSnippets;
  useErrorHandling(tablesError || metricsError || snippetsError);
  const filterReturnedEmpty =
    !!searchQuery && filteredTree.length === 0 && libraryHasContent;
  const showEmptyState =
    !isLoading && (!libraryHasContent || filterReturnedEmpty);

  const libraryColumnDef = useMemo<ColumnDef<TreeItem, ReactNode>[]>(
    () => [
      {
        accessorKey: "name",
        header: t`Name`,
        meta: { width: "auto" },
        cell: ({ getValue, row }) => {
          const data = row.original;
          return (
            <Group data-testid={`${data.model}-name`} gap="sm">
              {data.icon && <Icon name={data.icon} c="brand" />}
              {getValue()}
            </Group>
          );
        },
      },
      {
        accessorKey: "updatedAt",
        header: t`Updated At`,
        cell: ({ getValue }) => {
          const value = getValue() as string;
          return value && <DateTime value={value} />;
        },
      },
      {
        id: "actions",
        header: "",
        size: 24,
        cell: ({ row: { original } }) => {
          const { data } = original;
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
            <CreateMenu metricCollectionId={metricCollection?.id} />
          </Flex>
          <Card withBorder p={0}>
            {isLoading && <ListLoadingState />}
            {showEmptyState && (
              <ListEmptyState
                label={
                  filterReturnedEmpty
                    ? t`No results for "${searchQuery}"`
                    : t`No tables, metrics, or snippets yet`
                }
              />
            )}
            {!isLoading && !showEmptyState && (
              <Table
                data={filteredTree}
                columns={libraryColumnDef}
                onSelect={handleItemSelect}
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
