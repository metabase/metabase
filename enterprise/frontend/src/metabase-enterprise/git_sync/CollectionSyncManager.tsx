import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
  useUpdateCollectionMutation,
} from "metabase/api";
import {
  isInstanceAnalyticsCollection,
  isRootCollection,
  isTopLevelCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";
import {
  ActionIcon,
  Anchor,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
} from "metabase/ui";

export const CollectionSyncManager = () => {
  const { data: allCollections = [], isLoading } = useListCollectionsTreeQuery({
    "exclude-archived": true,
    "exclude-other-user-collections": true,
  });

  const { data: syncedCollectionsResponse, isLoading: isSyncedLoading } =
    useListCollectionItemsQuery({
      id: "root",
      models: ["collection"],
      collection_type: "remote-synced",
    });

  const syncedCollections = useMemo(
    () => syncedCollectionsResponse?.data || [],
    [syncedCollectionsResponse],
  );

  const [updateCollection] = useUpdateCollectionMutation();

  // Filter to get only top-level collections
  const topLevelCollections = useMemo(
    () =>
      allCollections.filter(
        (collection) =>
          isTopLevelCollection(collection) &&
          !isRootCollection(collection) &&
          nonPersonalOrArchivedCollection(collection) &&
          !isInstanceAnalyticsCollection(collection),
      ),
    [allCollections],
  );

  const availableCollections = useMemo(
    () =>
      topLevelCollections.filter(
        (collection) =>
          !syncedCollections.some((sc) => sc.id === collection.id),
      ),
    [topLevelCollections, syncedCollections],
  );

  const handleAddCollection = useCallback(
    (collectionId: string | null) => {
      if (collectionId) {
        updateCollection({
          id: Number(collectionId),
          type: "remote-synced",
        });
      }
    },
    [updateCollection],
  );

  const handleRemoveCollection = useCallback(
    (collectionId: number | string) => {
      updateCollection({
        id: Number(collectionId),
        type: null,
      });
    },
    [updateCollection],
  );

  const selectData = availableCollections.map((collection) => ({
    value: String(collection.id),
    label: collection.name,
  }));

  if (isLoading || isSyncedLoading) {
    return (
      <Flex align="center" justify="center" h={100}>
        <Loader size="md" />
      </Flex>
    );
  }

  return (
    <Stack gap="md">
      <Select
        placeholder={t`Select a top-level collection`}
        data={selectData}
        value={null}
        onChange={handleAddCollection}
        searchable
        clearable
        w={320}
        h={40}
        leftSection={<Icon name="folder" />}
        renderOption={({ option }) => {
          const collection = availableCollections.find(
            (c) => String(c.id) === option.value,
          );
          return (
            <Group justify="space-between" wrap="nowrap" w="100%" p="sm">
              <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                <Icon name="folder" c="brand" />
                <Text truncate>{option.label}</Text>
              </Group>
              {collection && (
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(Urls.collection(collection), "_blank");
                  }}
                >
                  <Icon name="external" />
                </ActionIcon>
              )}
            </Group>
          );
        }}
      />

      {syncedCollections.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text fw={600} mb="sm">
              {t`Synced Collections`}
            </Text>
            {syncedCollections.map((collection) => (
              <Paper
                key={collection.id}
                withBorder
                p="sm"
                radius="sm"
                bg="bg-light"
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <Icon name="folder" c="brand" />
                    <Anchor
                      href={Urls.collection(collection)}
                      c="brand"
                      fw={500}
                      underline="hover"
                    >
                      {collection.name}
                    </Anchor>
                  </Group>
                  <ActionIcon
                    variant="subtle"
                    c="text-medium"
                    onClick={() => handleRemoveCollection(collection.id)}
                  >
                    <Icon name="close" />
                  </ActionIcon>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      {syncedCollections.length === 0 && (
        <Text c="text-medium" fs="italic">
          {t`No collections are currently synced with Git`}
        </Text>
      )}
    </Stack>
  );
};
