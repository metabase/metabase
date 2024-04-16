import { useCallback, useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { isValidCollectionId } from "metabase/collections/utils";
import { useCollectionQuery, useQuestionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { SearchRequest, SearchModel } from "metabase-types/api";

import { CollectionItemPickerResolver } from "../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../CollectionPicker/utils";
import {
  DelayedLoadingSpinner,
  NestedItemPicker,
  type PickerState,
} from "../../EntityPicker";
import type { QuestionPickerOptions, QuestionPickerItem } from "../types";
import {
  generateKey,
  getCollectionIdPath,
  getStateFromIdPath,
  isFolder,
} from "../utils";

export const defaultOptions: QuestionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
  allowCreateNew: false,
};
interface QuestionPickerProps {
  onItemSelect: (item: QuestionPickerItem) => void;
  initialValue?: Pick<QuestionPickerItem, "model" | "id">;
  options: QuestionPickerOptions;
  models?: SearchModel[];
}

const useGetInitialCollection = (
  initialValue?: Pick<QuestionPickerItem, "model" | "id">,
) => {
  const isQuestion =
    initialValue && ["card", "dataset"].includes(initialValue.model);

  const cardId = isQuestion ? Number(initialValue.id) : undefined;

  const { data: currentQuestion, error: questionError } = useQuestionQuery({
    id: cardId,
    enabled: !!cardId,
  });

  const collectionId =
    isQuestion && currentQuestion
      ? currentQuestion?.collectionId()
      : initialValue?.id;

  const { data: currentCollection, error: collectionError } =
    useCollectionQuery({
      id: (isValidCollectionId(collectionId) && collectionId) || "root",
      enabled: !isQuestion || !!currentQuestion,
    });

  return {
    currentQuestion: currentQuestion?._card,
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
}: QuestionPickerProps) => {
  const [path, setPath] = useState<
    PickerState<QuestionPickerItem, SearchRequest>
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
            {
              id: currentCollection.id,
              location: currentCollection.location,
              is_personal: currentCollection.is_personal,
            },
            userPersonalCollectionId,
          ),
          models,
        });

        if (currentCollection.can_write) {
          // start with the current item selected if we can
          newPath[newPath.length - 1].selectedItem = currentQuestion
            ? {
                id: currentQuestion.id,
                name: currentQuestion.name,
                model: currentQuestion.type === "model" ? "dataset" : "card",
              }
            : {
                id: currentCollection.id,
                name: currentCollection.name,
                model: "collection",
              };
        }

        setPath(newPath);
      }
    },
    [currentCollection, userPersonalCollectionId],
  );

  if (error) {
    <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
    return <DelayedLoadingSpinner />;
  }

  return (
    <NestedItemPicker
      isFolder={(item: QuestionPickerItem) => isFolder(item, models)}
      options={options}
      generateKey={generateKey}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
    />
  );
};
