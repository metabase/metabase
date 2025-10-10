import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
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
import { useToast } from "metabase/common/hooks";
import * as Urls from "metabase/lib/urls";
import {
  ActionIcon,
  Box,
  Button,
  Combobox,
  Divider,
  Flex,
  Group,
  Icon,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from "metabase/ui";
import type { Collection, EnterpriseSettings } from "metabase-types/api";

import S from "./CollectionSyncManager.module.css";

interface CollectionSyncManagerProps {
  mode: EnterpriseSettings["remote-sync-type"];
}

const CREATE_OPTION_PREFIX = "__create__";

export const CollectionSyncManager = ({ mode }: CollectionSyncManagerProps) => {
  const [sendToast] = useToast();
  const [searchValue, setSearchValue] = useState("");
  const combobox = useCombobox();

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

  const syncedCollection = syncedCollections[0] || null;

  const [updateCollection, { isLoading: isUpdating }] =
    useUpdateCollectionMutation();

  const [createCollection, { isLoading: isCreating }] =
    useCreateCollectionMutation();

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
          !syncedCollection || collection.id !== syncedCollection.id,
      ),
    [topLevelCollections, syncedCollection],
  );

  const filteredCollections = useMemo(() => {
    if (!searchValue) {
      return availableCollections;
    }
    return availableCollections.filter((collection) =>
      collection.name.toLowerCase().includes(searchValue.toLowerCase()),
    );
  }, [availableCollections, searchValue]);

  const handleSelectCollection = useCallback(
    async (collectionId: string) => {
      if (collectionId.startsWith(CREATE_OPTION_PREFIX)) {
        const newName = collectionId.substring(CREATE_OPTION_PREFIX.length);
        try {
          const newCollection = await createCollection({
            name: newName,
            parent_id: null,
          }).unwrap();

          if (syncedCollection) {
            await updateCollection({
              id: Number(syncedCollection.id),
              type: null,
            }).unwrap();
          }

          await updateCollection({
            id: Number(newCollection.id),
            type: "remote-synced",
          }).unwrap();

          sendToast({
            message: t`Collection created and synced`,
            icon: "check",
          });
        } catch (error: any) {
          let message = t`Unable to create and sync collection`;
          if (typeof error.data?.cause === "string") {
            message += `: ${error.data?.cause}`;
          }
          sendToast({
            message,
            icon: "warning",
          });
        }
      } else {
        try {
          if (syncedCollection) {
            await updateCollection({
              id: Number(syncedCollection.id),
              type: null,
            }).unwrap();
          }

          await updateCollection({
            id: Number(collectionId),
            type: "remote-synced",
          }).unwrap();
        } catch (error: any) {
          let message = t`Unable to sync collection`;
          if (typeof error.data?.cause === "string") {
            message += `: ${error.data?.cause}`;
          }
          sendToast({
            message,
            icon: "warning",
          });
        }
      }
      combobox.closeDropdown();
      setSearchValue("");
    },
    [syncedCollection, updateCollection, createCollection, sendToast, combobox],
  );

  const handleClearCollection = useCallback(async () => {
    if (!syncedCollection) {
      return;
    }

    try {
      await updateCollection({
        id: Number(syncedCollection.id),
        type: null,
      }).unwrap();
    } catch (error: any) {
      let message = t`Unable to unsync collection`;
      if (typeof error.data?.cause === "string") {
        message += `: ${error.data?.cause}`;
      }
      sendToast({
        message,
        icon: "warning",
      });
    }
  }, [syncedCollection, updateCollection, sendToast]);

  useEffect(() => {
    if (!combobox.dropdownOpened) {
      setSearchValue("");
    }
  }, [combobox.dropdownOpened]);

  if (isLoading || isSyncedLoading) {
    return (
      <Flex align="center" justify="center" h={100}>
        <Loader size="md" />
      </Flex>
    );
  }

  const showCreateOption =
    searchValue.trim() &&
    !filteredCollections.some(
      (c) => c.name.toLowerCase() === searchValue.toLowerCase(),
    );

  const isProcessing = isUpdating || isCreating;

  if (!syncedCollection && mode !== "development") {
    return (
      <Stack gap="md" w="100%">
        <Flex direction="column" align="center" gap="md" py="xl" w="100%">
          <Icon name="folder" size={48} c="text-light" />
          <Box ta="center">
            <Text c="text-primary" mb="xs">
              {t`No collection synced yet`}
            </Text>
            <Text c="text-secondary" size="sm">
              {t`Collections synced from Git will appear here`}
            </Text>
          </Box>
        </Flex>
      </Stack>
    );
  }

  const isDisabled = mode !== "development" || isProcessing;

  return (
    <Stack gap="md" w="100%">
      <Flex gap="sm" align="center">
        <Combobox
          store={combobox}
          withinPortal
          position="bottom-start"
          middlewares={{ flip: true, shift: true }}
          disabled={isDisabled}
        >
          <Combobox.Target>
            <Button
              variant="default"
              c="text-primary"
              disabled={isDisabled}
              onClick={() => combobox.toggleDropdown()}
              fullWidth
              leftSection={
                isProcessing ? (
                  <Loader size="xs" />
                ) : (
                  <Icon name="folder" size={16} />
                )
              }
              rightSection={
                mode === "development" ? (
                  <Icon
                    name="chevrondown"
                    size={12}
                    c="text-secondary"
                    style={{
                      transform: combobox.dropdownOpened
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform 200ms ease",
                    }}
                  />
                ) : null
              }
              styles={{
                label: { flex: 1, textAlign: "left" },
              }}
            >
              <Text
                c={syncedCollection ? "text-primary" : "text-secondary"}
                truncate
              >
                {syncedCollection?.name || t`Select a collection to sync`}
              </Text>
            </Button>
          </Combobox.Target>

          <Combobox.Dropdown p={0}>
            <Box p="sm">
              <TextInput
                placeholder={t`Find or create a collection...`}
                value={searchValue}
                onChange={(e) => setSearchValue(e.currentTarget.value)}
                leftSection={<Icon name="search" size={16} />}
                data-autofocus
              />
            </Box>

            <Divider />

            <ScrollArea.Autosize mah={320} type="hover">
              {filteredCollections.length === 0 && !showCreateOption ? (
                <Box p="md">
                  <Text size="sm" c="text-light" ta="center">
                    {searchValue
                      ? t`No matching collections`
                      : t`No collections available`}
                  </Text>
                </Box>
              ) : (
                <>
                  {filteredCollections.length > 0 && (
                    <>
                      <Combobox.Options>
                        {filteredCollections.map((collection) => (
                          <Combobox.Option
                            key={collection.id}
                            value={String(collection.id)}
                            onClick={() =>
                              handleSelectCollection(String(collection.id))
                            }
                            py="sm"
                          >
                            <Group
                              justify="space-between"
                              wrap="nowrap"
                              w="100%"
                            >
                              <Group gap="xs" wrap="nowrap" flex={1} miw={0}>
                                <Icon
                                  className={S.CollectionSelectFolderIcon}
                                  name="folder"
                                  size={16}
                                />
                                <Text
                                  className={S.CollectionSelectText}
                                  truncate
                                >
                                  {collection.name}
                                </Text>
                              </Group>
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(
                                    Urls.collection(collection),
                                    "_blank",
                                  );
                                }}
                              >
                                <Icon
                                  className={S.CollectionSelectOpenIcon}
                                  name="external"
                                  size={14}
                                />
                              </ActionIcon>
                            </Group>
                          </Combobox.Option>
                        ))}
                      </Combobox.Options>
                      {showCreateOption && <Divider />}
                    </>
                  )}

                  {showCreateOption && (
                    <Box p="sm">
                      <Combobox.Option
                        py="sm"
                        value={`${CREATE_OPTION_PREFIX}${searchValue.trim()}`}
                        onClick={() =>
                          handleSelectCollection(
                            `${CREATE_OPTION_PREFIX}${searchValue.trim()}`,
                          )
                        }
                      >
                        <Group gap="xs" wrap="nowrap">
                          <Icon name="add" size={16} />
                          <Text>{t`Create collection "${searchValue.trim()}"`}</Text>
                        </Group>
                      </Combobox.Option>
                    </Box>
                  )}
                </>
              )}
            </ScrollArea.Autosize>
          </Combobox.Dropdown>
        </Combobox>

        {syncedCollection && mode === "development" && (
          <Button
            style={{ flexShrink: 0 }}
            variant="outline"
            onClick={handleClearCollection}
            disabled={isProcessing}
          >
            {t`Unsync collection`}
          </Button>
        )}
      </Flex>
    </Stack>
  );
};
