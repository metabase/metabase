import { useCallback, useMemo } from "react";
import { useDeepCompareEffect } from "react-use";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { CollectionItemModel } from "metabase-types/api";

import { useEnsureCollectionSelected } from "../../CollectionPicker";
import { CollectionItemPickerResolver } from "../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../CollectionPicker/utils";
import { DelayedLoadingSpinner, NestedItemPicker } from "../../EntityPicker";
import type {
  QuestionPickerItem,
  QuestionPickerOptions,
  QuestionPickerStatePath,
} from "../types";
import {
  getCollectionIdPath,
  getQuestionPickerValueModel,
  getStateFromIdPath,
  isFolder,
} from "../utils";

export const defaultOptions: QuestionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
  hasConfirmButtons: false,
};

interface QuestionPickerProps {
  initialValue?: Pick<QuestionPickerItem, "model" | "id">;
  models?: CollectionItemModel[];
  options: QuestionPickerOptions;
  path: QuestionPickerStatePath | undefined;
  shouldShowItem?: (item: QuestionPickerItem) => boolean;
  onInit: (item: QuestionPickerItem) => void;
  onItemSelect: (item: QuestionPickerItem) => void;
  onPathChange: (path: QuestionPickerStatePath) => void;
}

const useGetInitialCollection = (
  initialValue?: Pick<QuestionPickerItem, "model" | "id">,
) => {
  const isQuestion =
    initialValue && ["card", "dataset", "metric"].includes(initialValue.model);
  const isCollection = initialValue?.model === "collection";
  const cardId = isQuestion ? Number(initialValue.id) : undefined;
  const collectionId = isCollection
    ? isValidCollectionId(initialValue.id)
      ? initialValue.id
      : "root"
    : undefined;

  const { data: currentCollection, isLoading: isCollectionLoading } =
    useGetCollectionQuery(collectionId ? { id: collectionId } : skipToken);

  const { data: currentQuestion, isLoading: isQuestionLoading } =
    useGetCardQuery(cardId ? { id: cardId } : skipToken);

  const {
    data: currentQuestionCollection,
    isLoading: isCurrentQuestionCollectionLoading,
  } = useGetCollectionQuery(
    currentQuestion
      ? { id: currentQuestion.collection_id ?? "root" }
      : skipToken,
  );

  const {
    data: currentQuestionDashboard,
    isLoading: isCurrentQuestionDashboardLoading,
  } = useGetDashboardQuery(
    currentQuestion?.dashboard_id
      ? { id: currentQuestion.dashboard_id }
      : skipToken,
  );

  return {
    currentQuestion: currentQuestion,
    currentCollection: currentQuestionCollection ?? currentCollection,
    currentDashboard: currentQuestionDashboard,
    isLoading:
      isCollectionLoading ||
      isQuestionLoading ||
      isCurrentQuestionCollectionLoading ||
      isCurrentQuestionDashboardLoading,
  };
};

export const QuestionPicker = ({
  initialValue,
  models = ["dataset", "card"],
  options,
  path: pathProp,
  shouldShowItem,
  onInit,
  onItemSelect,
  onPathChange,
}: QuestionPickerProps) => {
  const defaultPath = useMemo(() => {
    return getStateFromIdPath({ idPath: ["root"], models });
  }, [models]);
  const path = pathProp ?? defaultPath;

  const { currentDashboard, currentCollection, currentQuestion, isLoading } =
    useGetInitialCollection(initialValue);

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: QuestionPickerItem }) => {
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(folder, userPersonalCollectionId),
        models,
      });
      onItemSelect(folder);
      onPathChange(newPath);
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
        const idPath = getCollectionIdPath(
          {
            ...currentDashboard,
            model: "dashboard",
            location: `${currentDashboard.collection?.location}${currentDashboard.collection_id}/`,
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
        const newSelectedItem: QuestionPickerItem = currentQuestion
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
      isFolder={(item: QuestionPickerItem) => isFolder(item, models)}
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
      shouldShowItem={shouldShowItem}
    />
  );
};
