import dayjs from "dayjs";
import { useCallback, useState } from "react";
import { goBack, push } from "react-router-redux";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
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
import { Table } from "metabase-enterprise/data-studio/common/components/Table";
import { useTreeFilter } from "metabase-enterprise/data-studio/common/components/Table/useTreeFilter";
import { ListEmptyState } from "metabase-enterprise/transforms/components/ListEmptyState";
import { ListLoadingState } from "metabase-enterprise/transforms/components/ListLoadingState";
import type { Collection, CollectionId } from "metabase-types/api";

import { SectionLayout } from "../../components/SectionLayout";

import { CreateMenu } from "./CreateMenu";
import { useBuildSnippetTree, useBuildTreeForCollection } from "./hooks";
import { type TreeItem, isCollection } from "./types";
import { getWritableCollection } from "./utils";

export function ModelingLandingPage() {
  usePageTitle(t`Modeling`);
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

  const modelCollection =
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
    tree: modelsTree,
    hasChildren: hasModels,
    isLoading: loadingModels,
  } = useBuildTreeForCollection(modelCollection);
  const {
    tree: metricsTree,
    hasChildren: hasMetrics,
    isLoading: loadingMetrics,
  } = useBuildTreeForCollection(metricCollection);
  const {
    tree: snippetTree,
    hasChildren: hasSnippets,
    isLoading: loadingSnippets,
  } = useBuildSnippetTree();

  const filteredTree = useTreeFilter({
    data: [...modelsTree, ...metricsTree, ...snippetTree],
    searchQuery,
    searchProps: ["name"],
  });

  const libraryHasContent = hasModels || hasMetrics || hasSnippets;
  const isLoading = loadingModels || loadingMetrics || loadingSnippets;

  return (
    <>
      <SectionLayout>
        <Stack
          px="3.5rem"
          pt="4rem"
          bg="background-light"
          mih="100%"
          data-testid="modeling-page"
        >
          <Flex gap="0.5rem">
            <TextInput
              placeholder="Search..."
              leftSection={<Icon name="search" />}
              bdrs="md"
              flex="1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <CreateMenu metricCollectionId={metricCollection?.id} />
          </Flex>
          <Card withBorder p={0}>
            {isLoading ? (
              <ListLoadingState />
            ) : !libraryHasContent ? (
              <ListEmptyState label={t`No tables, metrics, or snippets yet`} />
            ) : (
              <Table
                data={filteredTree}
                columns={[
                  {
                    accessorKey: "name",
                    header: "Name",
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
                    header: "Updated At",
                    cell: ({ getValue }) => {
                      const value = getValue() as string;

                      return value && dayjs(value).format("MMM D, h:mm: A");
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
                              setPermissionsCollectionId={
                                setPermissionsCollectionId
                              }
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
                ]}
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
          c="text-medium"
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
