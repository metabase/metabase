import { type ReactNode, useCallback, useMemo, useState } from "react";

import { skipToken, useSearchQuery } from "metabase/api";
import type {
  ActionItem,
  ModelActionPickerItem,
  ModelActionPickerStatePath,
  ModelActionPickerValue,
  ModelItem,
} from "metabase/common/components/DataPicker/types";
import { AutoScrollBox } from "metabase/common/components/EntityPicker";
import { isNotNull } from "metabase/lib/types";
import { Flex } from "metabase/ui";
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  CardId,
  DataGridWritebackActionId,
  WritebackAction,
} from "metabase-types/api";

import { ActionList } from "./ActionList";
import { ModelList } from "./ModelList";
import { generateModelActionKey, getActionItem, getModelItem } from "./utils";

interface Props {
  path: ModelActionPickerStatePath | undefined;
  value: ModelActionPickerValue | undefined;
  onItemSelect: (value: ModelActionPickerItem) => void;
  onPathChange: (path: ModelActionPickerStatePath) => void;
  children?: ReactNode;
}

export const ModelActionPicker = ({
  path,
  value,
  onItemSelect,
  onPathChange,
  children,
}: Props) => {
  const defaultPath = useMemo<ModelActionPickerStatePath>(() => {
    return [value?.model_id, value?.id];
  }, [value]);
  const [initialModelId, initialActionId] = path ?? defaultPath;
  const [modelId, setModelId] = useState<CardId | undefined>(initialModelId);
  const [actionId, setActionId] = useState<
    DataGridWritebackActionId | undefined
  >(initialActionId);

  const {
    data: modelsResponse,
    error: errorModels,
    isFetching: isLoadingModels,
  } = useSearchQuery({ models: ["dataset"] });

  const models = isLoadingModels ? undefined : modelsResponse?.data;

  // TODO: load by table
  const {
    data: allActions,
    error: errorActions,
    isFetching: isLoadingActions,
  } = useGetActionsQuery(isNotNull(modelId) ? undefined : skipToken);
  const actions = useMemo(
    () =>
      allActions?.filter((action) => {
        return (action as WritebackAction).model_id === modelId;
      }) || [],
    [allActions, modelId],
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
    (folder: ModelItem) => {
      if (folder.model === "dataset") {
        setModelId(folder.id);
        onItemSelect(folder);
        onPathChange([folder.id, undefined]);
      }

      setActionId(undefined);
    },
    [onPathChange, onItemSelect],
  );

  const handleActionSelect = useCallback(
    (item: ActionItem) => {
      setActionId(item.id);
      onItemSelect(item);
      onPathChange([modelId, item.id]);
    },
    [onItemSelect, onPathChange, modelId],
  );

  return (
    <>
      <AutoScrollBox
        contentHash={generateModelActionKey(
          selectedModelItem,
          selectedActionItem,
        )}
        data-testid="nested-item-picker"
      >
        <Flex h="100%" w="fit-content">
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

          {children}
        </Flex>
      </AutoScrollBox>
    </>
  );
};
