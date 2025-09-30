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
  Box,
  Flex,
  Group,
  Icon,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import type { Collection, EnterpriseSettings } from "metabase-types/api";

interface CollectionSyncManagerProps {
  mode: EnterpriseSettings["remote-sync-type"];
}

interface CollectionSelectProps {
  availableCollections: Collection[];
  onAddCollection: (collectionId: string | null) => void;
}

const CollectionSelect = ({
  availableCollections,
  onAddCollection,
}: CollectionSelectProps) => {
  const selectData = availableCollections.map((collection) => ({
    value: String(collection.id),
    label: collection.name,
  }));

  return (
    <Box>
      <Select
        placeholder={
          availableCollections.length > 0
            ? t`Add a collection to sync`
            : t`All collections are already syncing`
        }
        data={selectData}
        value={null}
        onChange={onAddCollection}
        searchable
        clearable
        w="100%"
        maw={400}
        leftSection={<Icon name="add" size={16} />}
        disabled={availableCollections.length === 0}
        renderOption={({ option }) => {
          const collection = availableCollections.find(
            (c) => String(c.id) === option.value,
          );
          return (
            <Group justify="space-between" wrap="nowrap" w="100%" p="sm">
              <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                <Icon name="folder" c="brand" size={16} />
                <Text truncate size="sm">
                  {option.label}
                </Text>
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
                  <Icon name="external" size={14} />
                </ActionIcon>
              )}
            </Group>
          );
        }}
      />
    </Box>
  );
};

interface SyncedCollectionItemProps {
  collection: Collection;
  mode: EnterpriseSettings["remote-sync-type"];
  onRemove: (collectionId: number | string) => void;
}

const SyncedCollectionItem = ({
  collection,
  mode,
  onRemove,
}: SyncedCollectionItemProps) => (
  <Paper key={collection.id} withBorder p="md" radius="md">
    <Flex justify="space-between" align="center">
      <Flex align="center" gap="sm" flex={1}>
        <Icon name="folder" size={16} c="brand" />
        <Anchor
          href={Urls.collection(collection)}
          c="text-dark"
          fw={500}
          td="none"
          styles={{
            root: {
              "&:hover": {
                textDecoration: "underline",
              },
            },
          }}
        >
          {collection.name}
        </Anchor>
      </Flex>
      {mode === "development" && (
        <ActionIcon
          variant="subtle"
          color="error"
          size="sm"
          onClick={() => onRemove(collection.id)}
        >
          <Icon name="close" size={14} />
        </ActionIcon>
      )}
    </Flex>
  </Paper>
);

interface EmptyStateProps {
  mode: EnterpriseSettings["remote-sync-type"];
  hasAvailableCollections: boolean;
}

const EmptyState = ({ mode, hasAvailableCollections }: EmptyStateProps) => {
  const getEmptyMessage = () => {
    if (mode === "development" && !hasAvailableCollections) {
      return t`No collections available to sync`;
    }
    return mode === "development"
      ? t`No collections selected for Git sync`
      : t`No collections synced from Git yet`;
  };

  return (
    <Box ta="center" py="xl">
      <Icon name="folder" size={48} c="text-light" mb="md" />
      <Text c="text-medium" size="sm">
        {getEmptyMessage()}
      </Text>
    </Box>
  );
};

export const CollectionSyncManager = ({ mode }: CollectionSyncManagerProps) => {
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
    () => (syncedCollectionsResponse?.data || []) as Collection[],
    [syncedCollectionsResponse],
  );

  const [updateCollection] = useUpdateCollectionMutation();

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

  if (isLoading || isSyncedLoading) {
    return (
      <Flex align="center" justify="center" h={100}>
        <Loader size="md" />
      </Flex>
    );
  }

  const hasSyncedCollections = syncedCollections.length > 0;
  const hasAvailableCollections = availableCollections.length > 0;

  return (
    <Stack gap="lg">
      {mode === "development" && (
        <CollectionSelect
          availableCollections={availableCollections}
          onAddCollection={handleAddCollection}
        />
      )}

      {hasSyncedCollections ? (
        <Box>
          <Text c="text-medium" size="sm" mb="md">
            {mode === "export"
              ? t`${syncedCollections.length} collection${syncedCollections.length === 1 ? "" : "s"} syncing to Git`
              : t`${syncedCollections.length} collection${syncedCollections.length === 1 ? "" : "s"} from Git`}
          </Text>
          <Stack gap="xs">
            {syncedCollections.map((collection) => (
              <SyncedCollectionItem
                key={collection.id}
                collection={collection}
                mode={mode}
                onRemove={handleRemoveCollection}
              />
            ))}
          </Stack>
        </Box>
      ) : (
        <EmptyState
          mode={mode}
          hasAvailableCollections={hasAvailableCollections}
        />
      )}
    </Stack>
  );
};
