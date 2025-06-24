import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import ActionCreator from "metabase/actions/containers/ActionCreator/ActionCreator";
import { skipToken, useListActionsV2Query, useSearchQuery } from "metabase/api";
import type { ActionItem } from "metabase/common/components/DataPicker/types";
import {
  AutoScrollBox,
  ItemList,
  ListBox,
} from "metabase/common/components/EntityPicker";
import Modal from "metabase/common/components/Modal";
import { isNotNull } from "metabase/lib/types";
import { Box, Button, Divider, Flex, Icon, Stack } from "metabase/ui";
import type {
  CardId,
  CollectionId,
  DataGridWritebackActionId,
  SearchResult,
} from "metabase-types/api";

import { ActionList } from "./ActionList";
import { ModelList } from "./ModelList";
import type {
  CollectionListItem,
  ModelActionPickerFolderItem,
  ModelActionPickerItem,
  ModelActionPickerStatePath,
} from "./types";
import {
  generateModelActionKey,
  getActionItem,
  getCollectionItem,
  getModelItem,
} from "./utils";

interface Props {
  path: ModelActionPickerStatePath | undefined;
  onItemSelect: (value: ModelActionPickerItem) => void;
  onPathChange: (path: ModelActionPickerStatePath) => void;
}

const isFolderTrue = () => true;

export const ModelActionPicker = ({
  path,
  onItemSelect,
  onPathChange,
}: Props) => {
  const [initialCollectionId, initialModelId, initialActionId] = path ?? [
    undefined,
    undefined,
    undefined,
  ];
  const [collectionId, setCollectionId] = useState<CollectionId | undefined>(
    initialCollectionId,
  );
  const [modelId, setModelId] = useState<CardId | undefined>(initialModelId);
  const [actionId, setActionId] = useState<
    DataGridWritebackActionId | undefined
  >(initialActionId);

  const [showNewActionModal, { open, close }] = useDisclosure(false);

  const {
    data: modelsResponse,
    isFetching: isLoadingModels,
    error: errorModels,
  } = useSearchQuery({
    models: ["dataset"],
    model_ancestors: false,
    include_metadata: false,
  }); // TODO: most likely we should handle pagination here, but for now we just reused the logic of a previous picker

  const allModels = isLoadingModels
    ? undefined
    : (modelsResponse?.data as SearchResult<CardId>[] | undefined);

  const collections = useMemo(() => {
    const result: CollectionListItem[] = [];
    const addedCollectionsSet = new Set();

    allModels?.forEach(({ collection, collection_position }) => {
      const ensuredId = collection.id || "root";

      if (ensuredId && !addedCollectionsSet.has(ensuredId)) {
        result.push({
          id: ensuredId,
          name: collection.name ?? t`Our Analytics`,
          model: "collection",
          position: collection_position,
        });
        addedCollectionsSet.add(ensuredId);
      }
    });

    return result;
  }, [allModels]);

  const models = useMemo(() => {
    return allModels?.filter((model) => {
      const ensuredId = model.collection.id || "root";
      return ensuredId === collectionId;
    });
  }, [allModels, collectionId]);

  const {
    data: actionsResponse,
    error: errorActions,
    isFetching: isLoadingActions,
    refetch: refetchActions,
  } = useListActionsV2Query(
    isNotNull(modelId) ? { "model-id": modelId } : skipToken,
  );
  const actions = isLoadingActions ? undefined : actionsResponse?.actions;

  const selectedCollectionItem = useMemo(
    () => getCollectionItem(collections, collectionId),
    [collections, collectionId],
  );

  const selectedModelItem = useMemo(
    () => getModelItem(models, modelId),
    [models, modelId],
  );

  const selectedActionItem = useMemo(
    () => getActionItem(actions, actionId),
    [actions, actionId],
  );

  const handleFolderSelect = useCallback(
    (folder: ModelActionPickerFolderItem) => {
      if (folder.model === "collection") {
        setCollectionId(folder.id);
        onItemSelect(folder);
        onPathChange([folder.id, undefined, undefined]);

        setModelId(undefined);
      }

      if (folder.model === "dataset") {
        setModelId(folder.id);
        onItemSelect(folder);
        onPathChange([collectionId, folder.id, undefined]);
      }

      setActionId(undefined);
    },
    [onItemSelect, onPathChange, collectionId],
  );

  const handleActionSelect = useCallback(
    (item: ActionItem) => {
      setActionId(item.id);
      onItemSelect(item);
      onPathChange([collectionId, modelId, item.id]);
    },
    [onItemSelect, onPathChange, collectionId, modelId],
  );

  const handleActionCreate = useCallback(() => {
    refetchActions();
  }, [refetchActions]);

  const handleFolderSelectRef = useLatest(handleFolderSelect);

  useEffect(
    function ensureSingleCollectionSelected() {
      const hasItems =
        !isLoadingModels && collections && collections.length > 0;

      if (hasItems && !selectedCollectionItem) {
        const firstItem = collections[0];
        const item = getCollectionItem(collections, firstItem.id);

        if (item) {
          handleFolderSelectRef.current(item);
        }
      }
    },
    [
      handleFolderSelectRef,
      isLoadingModels,
      collections,
      selectedCollectionItem,
    ],
  );

  useEffect(
    function ensureSingleModelSelected() {
      const hasSingleItem = !isLoadingModels && models && models.length === 1;

      if (hasSingleItem && !selectedModelItem) {
        const firstItem = models[0];
        const item = getModelItem(models, firstItem.id);

        if (item) {
          handleFolderSelectRef.current(item);
        }
      }
    },
    [handleFolderSelectRef, isLoadingModels, models, selectedModelItem],
  );

  return (
    <>
      <Stack gap={0} h="100%">
        <AutoScrollBox
          contentHash={generateModelActionKey(
            selectedModelItem,
            selectedActionItem,
          )}
          data-testid="nested-item-picker"
        >
          <Flex h="100%" w="fit-content">
            {collections?.length > 1 && (
              <ListBox data-testid="item-picker-level-0">
                <ItemList
                  error={errorModels}
                  isCurrentLevel={!modelId}
                  isFolder={isFolderTrue}
                  isLoading={isLoadingModels}
                  items={isLoadingModels ? undefined : collections}
                  selectedItem={selectedCollectionItem}
                  onClick={handleFolderSelect}
                />
              </ListBox>
            )}

            <ModelList
              error={errorModels}
              isCurrentLevel={!actionId}
              isLoading={isLoadingModels}
              selectedItem={selectedModelItem}
              models={isLoadingModels ? undefined : models}
              onClick={handleFolderSelect}
            />

            {isNotNull(modelId) && (
              <ActionList
                error={errorActions}
                isCurrentLevel
                isLoading={isLoadingActions}
                selectedItem={selectedActionItem}
                actions={isLoadingActions ? undefined : actions}
                onClick={handleActionSelect}
              />
            )}
          </Flex>
        </AutoScrollBox>
        <Divider />
        <Box p="1rem 2rem">
          <Button
            leftSection={<Icon name="add" />}
            disabled={!modelId}
            onClick={open}
          >{t`Create a new action`}</Button>
        </Box>
      </Stack>
      {showNewActionModal && (
        <Modal wide data-testid="action-creator-modal" onClose={close}>
          <ActionCreator
            modelId={modelId}
            onSubmit={handleActionCreate}
            onClose={close}
          />
        </Modal>
      )}
    </>
  );
};
