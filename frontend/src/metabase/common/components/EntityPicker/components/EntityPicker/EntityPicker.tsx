import {
  forwardRef,
  useCallback,
  useMemo,
  useImperativeHandle,
  type Ref,
  useEffect,
} from "react";
import { useDeepCompareEffect } from "react-use";

import {
  skipToken,
  useGetCardQuery,
  useGetCollectionQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { CollectionItemModel } from "metabase-types/api";

import { DelayedLoadingSpinner, NestedItemPicker } from "../";
import { useEnsureCollectionSelected } from "../../../CollectionPicker";
import { CollectionItemPickerResolver } from "../../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../../CollectionPicker/utils";
import type {
  QuestionPickerItem,
  QuestionPickerOptions,
  QuestionPickerStatePath,
} from "../../../QuestionPicker/types";

import {
  getCollectionIdPath,
  getQuestionPickerValueModel,
  getStateFromIdPath,
  isFolder,
} from "./utils";
import { useGetInitialPath } from "./hooks/useGetInitialPath";

export const defaultOptions: QuestionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
  hasConfirmButtons: false,
};

interface QuestionPickerProps {
  initialValue?: Pick<QuestionPickerItem, "model" | "id">;
  models?: CollectionItemModel[];
  options?: QuestionPickerOptions;
  path: QuestionPickerStatePath | undefined;
  shouldShowItem?: (item: QuestionPickerItem) => boolean;
  onInit?: (item: QuestionPickerItem) => void;
  onItemSelect: (item: QuestionPickerItem) => void;
  onPathChange: (path: QuestionPickerStatePath) => void;
  shouldDisableItem?: (item: QuestionPickerItem) => boolean;
}

const useGetInitialCollection = (
  initialValue?: Pick<QuestionPickerItem, "model" | "id">,
) => {
  const isQuestion =
    initialValue && ["card", "dataset", "metric"].includes(initialValue.model);
  const isCollection = initialValue?.model === "collection";
  const cardId = isQuestion ? Number(initialValue.id) : undefined;
  const collectionId = isCollection
    ? initialValue.id === null
      ? "root"
      : isValidCollectionId(initialValue.id)
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

  return {
    currentQuestion: currentQuestion,
    currentCollection: currentQuestionCollection ?? currentCollection,
    isLoading:
      isCollectionLoading ||
      isQuestionLoading ||
      isCurrentQuestionCollectionLoading,
  };
};

export const EntityPicker = forwardRef(
  (
    {
      initialValue,
      models = ["dataset", "card"],
      options,
      path: pathProp,
      shouldShowItem,
      onInit,
      onItemSelect,
      onPathChange,
      shouldDisableItem,
    }: QuestionPickerProps,
    ref: Ref<unknown>,
  ) => {
    const defaultPath = useMemo(() => {
      return getStateFromIdPath({
        idPath: ["root"],
        models,
        namespace: options.namespace,
      });
    }, [models]);
    const path = pathProp ?? defaultPath;

    console.log({ path });

    // const { currentCollection, currentQuestion, isLoading } =
    //   useGetInitialCollection(initialValue);

    const {
      isLoading,
      path: initialPath,
      selectedItem: initialSelectedItem,
      collection: currentCollection,
    } = useGetInitialPath(models, options, initialValue);

    const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

    const onFolderSelect = useCallback(
      ({ folder }: { folder: QuestionPickerItem }) => {
        console.log({ folder });
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(folder, userPersonalCollectionId),
          models,
          namespace: options.namespace,
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
        newPath[newPath.length - 1].selectedItem = { ...item };

        onItemSelect(item);
        onPathChange(newPath);
      },
      [onItemSelect, onPathChange, path, userPersonalCollectionId],
    );

    useDeepCompareEffect(() => {
      if (!isLoading && initialPath && !pathProp) {
        // if (currentCollection.can_write) {
        //   // start with the current item selected if we can
        //   onItemSelect({
        //     ...currentCollection,
        //     model: "collection",
        //   });
        // }
        onPathChange(initialPath);
      }
    }, [isLoading, initialPath, initialSelectedItem, currentCollection]);

    // useDeepCompareEffect(
    //   function setInitialPath() {
    //     if (currentCollection?.id) {
    //       const newPath = getStateFromIdPath({
    //         idPath: getCollectionIdPath(
    //           currentCollection,
    //           userPersonalCollectionId,
    //         ),
    //         models,
    //       });

    //       // start with the current item selected if we can
    //       const newSelectedItem: QuestionPickerItem = currentQuestion
    //         ? {
    //             id: currentQuestion.id,
    //             name: currentQuestion.name,
    //             model: getQuestionPickerValueModel(currentQuestion.type),
    //           }
    //         : {
    //             id: currentCollection.id,
    //             name: currentCollection.name,
    //             model: "collection",
    //           };

    //       newPath[newPath.length - 1].selectedItem = newSelectedItem;

    //       onPathChange(newPath);
    //       if (currentCollection.can_write) {
    //         // start with the current item selected if we can
    //         onItemSelect({
    //           ...currentCollection,
    //           model: "collection",
    //         });
    //       }
    //     }
    //   },
    //   [currentCollection, userPersonalCollectionId, onPathChange],
    // );

    // Exposing onNewCollection so that parent can select newly created
    // folder
    useImperativeHandle(
      ref,
      () => ({
        onNewItem: handleItemSelect,
      }),
      [onFolderSelect],
    );

    useEnsureCollectionSelected({
      currentCollection,
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
        shouldDisableItem={shouldDisableItem}
      />
    );
  },
);
