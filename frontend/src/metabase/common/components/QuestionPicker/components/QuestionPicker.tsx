import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { useCollectionQuery, useQuestionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { SearchRequest, SearchModelType } from "metabase-types/api";

import type { CollectionPickerItem } from "../../CollectionPicker";
import {
  LoadingSpinner,
  NestedItemPicker,
  type PickerState,
} from "../../EntityPicker";
import type { QuestionPickerItem, QuestionPickerOptions } from "../types";
import {
  generateKey,
  getCollectionIdPath,
  getStateFromIdPath,
  isFolder,
} from "../utils";

import { QuestionItemPickerResolver } from "./QuestionItemPickerResolver";

export const defaultOptions: QuestionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};
interface QuestionPickerProps {
  onItemSelect: (item: QuestionPickerItem | CollectionPickerItem) => void;
  initialValue?: Pick<QuestionPickerItem, "model" | "id">;
  options: QuestionPickerOptions;
  models?: SearchModelType[];
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
      id: collectionId ?? "root",
      enabled: !isQuestion || !!currentQuestion,
    });

  return {
    currentQuestion: currentQuestion?._card,
    currentCollection,
    isLoading: !currentCollection,
    error: questionError ?? collectionError,
  };
};

export const QuestionPickerInner = (
  {
    onItemSelect,
    initialValue,
    options,
    models = ["dataset", "card"],
  }: QuestionPickerProps,
  ref: Ref<unknown>,
) => {
  const [path, setPath] = useState<
    PickerState<QuestionPickerItem | CollectionPickerItem, SearchRequest>
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

  const handleItemSelect = (item: QuestionPickerItem) => {
    // set selected item at the correct level
    const pathLevel = path.findIndex(
      level => level?.query?.collection === (item?.collection_id ?? "root"),
    );

    const newPath = path.slice(0, pathLevel + 1);
    newPath[newPath.length - 1].selectedItem = item;
    setPath(newPath);
    onItemSelect(item);
  };

  // Exposing onFolderSelect so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      onFolderSelect,
    }),
    [onFolderSelect],
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

        setPath(newPath);

        if (currentCollection.can_write) {
          // start with the current item selected if we can
          onItemSelect(
            currentQuestion
              ? {
                  id: currentQuestion.id,
                  name: currentQuestion.name,
                  model: currentQuestion.type === "model" ? "dataset" : "card",
                }
              : {
                  id: currentCollection.id,
                  name: currentCollection.name,
                  model: "collection",
                },
          );
        }
      }
    },
    [currentCollection, userPersonalCollectionId],
  );

  if (error) {
    <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemName={t`question`}
      isFolder={isFolder}
      options={options}
      generateKey={generateKey}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={QuestionItemPickerResolver}
    />
  );
};

export const QuestionPicker = forwardRef(QuestionPickerInner);
