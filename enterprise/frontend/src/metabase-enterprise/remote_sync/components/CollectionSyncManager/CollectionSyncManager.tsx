import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionItemsQuery,
  useUpdateCollectionMutation,
} from "metabase/api";
import { useToast } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import { Button, Flex, Icon, Loader, Text, TextInput } from "metabase/ui";
import type { Collection, EnterpriseSettings } from "metabase-types/api";

interface CollectionSyncManagerProps {
  mode: EnterpriseSettings["remote-sync-type"];
}

export const CollectionSyncManager = ({ mode }: CollectionSyncManagerProps) => {
  const [sendToast] = useToast();
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);

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

  const syncedCollection = syncedCollections[0] || null;

  const [updateCollection, { isLoading: isUpdating }] =
    useUpdateCollectionMutation();

  const [createCollection, { isLoading: isCreating }] =
    useCreateCollectionMutation();

  const handleCreateCollection = useCallback(async () => {
    if (!newCollectionName.trim()) {
      return;
    }

    try {
      const newCollection = await createCollection({
        name: newCollectionName.trim(),
        parent_id: null,
      }).unwrap();

      await updateCollection({
        id: Number(newCollection.id),
        type: "remote-synced",
      }).unwrap();

      sendToast({
        message: t`Created synced collection ${newCollectionName.trim()}`,
        icon: "check",
      });

      setNewCollectionName("");
      setIsCreatingNew(false);
    } catch (error: any) {
      let message = t`Failed to create collection`;
      if (typeof error.data?.cause === "string") {
        message += `: ${error.data?.cause}`;
      }
      sendToast({
        message,
        icon: "warning",
      });
    }
  }, [newCollectionName, createCollection, updateCollection, sendToast]);

  if (isSyncedLoading) {
    return (
      <Flex align="center" justify="center" h={100}>
        <Loader size="md" />
      </Flex>
    );
  }

  const isProcessing = isUpdating || isCreating;

  if (!syncedCollection) {
    if (mode !== "development") {
      return (
        <Flex gap="sm" align="center" w="100%">
          <Text c="text-secondary">{t`No collection to sync from Git`}</Text>
        </Flex>
      );
    }

    if (isCreatingNew) {
      return (
        <Flex gap="sm" align="center" w="100%">
          <TextInput
            placeholder={t`Collection name`}
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateCollection();
              } else if (e.key === "Escape") {
                setIsCreatingNew(false);
                setNewCollectionName("");
              }
            }}
            disabled={isProcessing}
            leftSection={<Icon name="folder" size={16} />}
            rightSection={isProcessing ? <Loader size="xs" /> : undefined}
            flex={1}
            data-autofocus
          />
          <Button
            onClick={handleCreateCollection}
            disabled={!newCollectionName.trim() || isProcessing}
            style={{ flexShrink: 0 }}
          >
            {t`Create`}
          </Button>
          <Button
            variant="subtle"
            onClick={() => {
              setIsCreatingNew(false);
              setNewCollectionName("");
            }}
            disabled={isProcessing}
            c="text-secondary"
            style={{ flexShrink: 0 }}
          >
            {t`Cancel`}
          </Button>
        </Flex>
      );
    }

    return (
      <Flex gap="sm" align="center" w="100%">
        <Button
          variant="default"
          onClick={() => setIsCreatingNew(true)}
          leftSection={<Icon name="add" size={16} />}
          c="text-secondary"
          style={{ flexShrink: 0 }}
        >
          {t`Create a synced collection`}
        </Button>
      </Flex>
    );
  }

  return (
    <Flex gap="sm" align="center" w="100%">
      <Button
        component="a"
        href={Urls.collection(syncedCollection)}
        target="_blank"
        variant="default"
        c="text-primary"
        fullWidth
        leftSection={<Icon name="folder" size={16} />}
        rightSection={<Icon name="external" size={12} c="text-secondary" />}
        styles={{
          label: { flex: 1, textAlign: "left" },
        }}
      >
        <Text c="text-primary" truncate>
          {syncedCollection.name}
        </Text>
      </Button>
    </Flex>
  );
};
