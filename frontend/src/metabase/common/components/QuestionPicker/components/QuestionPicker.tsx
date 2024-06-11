import { useCallback, useState } from "react";
import { useDeepCompareEffect } from "react-use";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type {
  CollectionItemModel,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import { CollectionItemPickerResolver } from "../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../CollectionPicker/utils";
import {
  DelayedLoadingSpinner,
  NestedItemPicker,
  type PickerState,
} from "../../EntityPicker";
import type { QuestionPickerItem, QuestionPickerOptions } from "../types";
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
  onItemSelect: (item: QuestionPickerItem) => void;
  initialValue?: Pick<QuestionPickerItem, "model" | "id">;
  options: QuestionPickerOptions;
  models?: CollectionItemModel[];
  shouldShowItem?: (item: QuestionPickerItem) => boolean;
}

const useGetInitialCollection = (
  initialValue?: Pick<QuestionPickerItem, "model" | "id">,
) => {
  const isQuestion =
    initialValue && ["card", "dataset", "metric"].includes(initialValue.model);

  const cardId = isQuestion ? Number(initialValue.id) : undefined;

  const { data: currentQuestion, error: questionError } = useGetCardQuery(
    cardId ? { id: cardId } : skipToken,
  );

  const collectionId =
    isQuestion && currentQuestion
      ? currentQuestion?.collection_id
      : initialValue?.id;

  const { data: currentCollection, error: collectionError } =
    useGetCollectionQuery(
      !isQuestion || !!currentQuestion
        ? (isValidCollectionId(collectionId) && collectionId) || "root"
        : skipToken,
    );

  return {
    currentQuestion: currentQuestion,
    currentCollection,
    isLoading: !currentCollection,
    error: questionError ?? collectionError,
  };
};

export const QuestionPicker = ({
  onItemSelect,
  initialValue,
  options,
  models = ["dataset", "card"],
  shouldShowItem,
}: QuestionPickerProps) => {
  const [path, setPath] = useState<
    PickerState<QuestionPickerItem, ListCollectionItemsRequest>
  >(() =>
    getStateFromIdPath({
      idPath: ["root"],
      models,
    }),
  );

  const {
    currentCollection,
    currentQuestion,
    error,
    isLoading: loadingCurrentCollection,
  } = useGetInitialCollection(initialValue);

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: QuestionPickerItem }) => {
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(folder, userPersonalCollectionId),
        models,
      });
      setPath(newPath);
      onItemSelect(folder);
    },
    [setPath, onItemSelect, userPersonalCollectionId, models],
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
      setPath(newPath);
      onItemSelect(item);
    },
    [setPath, onItemSelect, path, userPersonalCollectionId],
  );

  useDeepCompareEffect(
    function setInitialPath() {
      if (currentCollection?.id) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(
            currentCollection,
            userPersonalCollectionId,
          ),
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
              id: currentCollection.id,
              name: currentCollection.name,
              model: "collection",
            };

        setPath(newPath);
      }
    },
    [currentCollection, userPersonalCollectionId],
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
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
