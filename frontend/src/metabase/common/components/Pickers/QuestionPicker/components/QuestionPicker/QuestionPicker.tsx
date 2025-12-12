import { useCallback, useMemo } from "react";
import { useDeepCompareEffect } from "react-use";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import {
  DelayedLoadingSpinner,
  NestedItemPicker,
} from "../../../../EntityPicker";
import { useEnsureCollectionSelected } from "../../../CollectionPicker";
import { CollectionItemPickerResolver } from "../../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../../CollectionPicker/utils";
import {
  type TablePickerItem,
  type TablePickerStatePath,
  type TablePickerValue,
  isTablePickerValue,
} from "../../../TablePicker";
import { useGetInitialContainer } from "../../../hooks";
import { getCollectionIdPath, getStateFromIdPath } from "../../../utils";
import type {
  QuestionPickerItem,
  QuestionPickerModel,
  QuestionPickerOptions,
  QuestionPickerStatePath,
} from "../../types";
import {
  getQuestionPickerValueModel,
  isFolder,
  isTablePickerFolderOrQuestionPickerFolder,
} from "../../utils";

export const defaultOptions: QuestionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
  hasConfirmButtons: false,
};

interface QuestionPickerProps {
  initialValue?: Pick<QuestionPickerItem, "model" | "id"> | TablePickerValue;
  models?: QuestionPickerModel[];
  options: QuestionPickerOptions;
  path: QuestionPickerStatePath | undefined;
  tablesPath?: TablePickerStatePath;
  shouldShowItem?: (item: QuestionPickerItem) => boolean;
  onInit: (item: QuestionPickerItem) => void;
  onItemSelect: (item: QuestionPickerItem) => void;
  onPathChange: (path: QuestionPickerStatePath) => void;
  onTablesPathChange?: (path: TablePickerStatePath) => void;
  shouldDisableItem?: (
    item: QuestionPickerItem,
    models?: QuestionPickerModel[],
  ) => boolean;
}

export const QuestionPicker = ({
  initialValue,
  models = ["dataset", "card"],
  options,
  path: pathProp,
  tablesPath,
  shouldShowItem,
  onInit,
  onItemSelect,
  onPathChange,
  onTablesPathChange,
  shouldDisableItem,
}: QuestionPickerProps) => {
  const defaultPath = useMemo(() => {
    return getStateFromIdPath({
      idPath: ["root"],
      models,
    });
  }, [models]);
  const path = pathProp ?? defaultPath;

  const {
    currentTable,
    currentQuestion,
    currentCollection,
    currentDashboard,
    isLoading,
  } = useGetInitialContainer(initialValue);

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: QuestionPickerItem }) => {
      onItemSelect(folder);

      //if it's actually a folder
      if (isFolder(folder, models)) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(folder, userPersonalCollectionId),
          models: models,
        });

        onPathChange(newPath);
      }
    },
    [onItemSelect, onPathChange, userPersonalCollectionId, models],
  );

  const handleItemSelect = useCallback(
    (item: QuestionPickerItem) => {
      // set selected item at the correct level
      const pathLevel = getPathLevelForItem(
        item,
        path,
        userPersonalCollectionId,
      );

      const newPath = path.slice(0, pathLevel + 1);
      newPath[newPath.length - 1].selectedItem = item;
      onItemSelect(item);
      onPathChange(newPath);
    },
    [onItemSelect, onPathChange, path, userPersonalCollectionId],
  );

  useDeepCompareEffect(
    function setInitialPath() {
      if (currentDashboard?.id) {
        const location =
          currentDashboard.collection_id === null
            ? "/"
            : `${currentDashboard.collection?.location ?? ""}${currentDashboard.collection?.id ?? ""}/`;

        const idPath = getCollectionIdPath(
          {
            ...currentDashboard,
            model: "dashboard",
            location,
            is_tenant_dashboard: PLUGIN_TENANTS.isTenantNamespace(
              currentDashboard?.collection?.namespace,
            ),
          },
          userPersonalCollectionId,
        );

        const newPath = getStateFromIdPath({
          idPath,
          models,
        });

        // start with the current item selected if we can
        newPath[newPath.length - 1].selectedItem = currentQuestion
          ? {
              id: currentQuestion.id,
              name: currentQuestion.name,
              model: getQuestionPickerValueModel(currentQuestion.type),
            }
          : {
              id: currentDashboard.id,
              name: currentDashboard.name,
              model: "dashboard",
            };

        onPathChange(newPath);
      } else if (currentCollection?.id) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(
            { ...currentCollection, model: "collection" },
            userPersonalCollectionId,
          ),
          models,
        });

        // start with the current item selected if we can
        const newSelectedItem: QuestionPickerItem = currentTable
          ? {
              id: currentTable.id,
              name: currentTable.display_name,
              model: "table",
            }
          : currentQuestion
            ? {
                id: currentQuestion.id,
                name: currentQuestion.name,
                model: getQuestionPickerValueModel(currentQuestion.type),
              }
            : {
                id: currentCollection.id,
                name: currentCollection.name,
                model: "collection",
              };

        newPath[newPath.length - 1].selectedItem = newSelectedItem;

        onPathChange(newPath);
      }
    },
    [
      currentDashboard,
      currentCollection,
      userPersonalCollectionId,
      onPathChange,
      models,
    ],
  );

  useEnsureCollectionSelected({
    currentCollection,
    currentDashboard,
    enabled: path === defaultPath,
    options,
    useRootCollection: initialValue?.id == null,
    onInit,
  });

  if (isLoading) {
    return <DelayedLoadingSpinner />;
  }

  return (
    <NestedItemPicker
      initialValue={isTablePickerValue(initialValue) ? initialValue : undefined}
      isFolder={(item: QuestionPickerItem | TablePickerItem) =>
        isTablePickerFolderOrQuestionPickerFolder(item, models)
      }
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
      shouldShowItem={shouldShowItem}
      shouldDisableItem={
        shouldDisableItem
          ? (item) => shouldDisableItem(item, models)
          : undefined
      }
      tablesPath={tablesPath}
      onTablesPathChange={onTablesPathChange}
    />
  );
};
