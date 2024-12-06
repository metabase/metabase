import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import { useDeepCompareEffect } from "react-use";

import { isValidCollectionId } from "metabase/collections/utils";
import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { Collection } from "metabase-types/api";

import { LoadingSpinner, NestedItemPicker } from "../../EntityPicker";
import { useEnsureCollectionSelected } from "../hooks";
import type {
  CollectionPickerItem,
  CollectionPickerOptions,
  CollectionPickerStatePath,
} from "../types";
import {
  getCollectionIdPath,
  getParentCollectionId,
  getPathLevelForItem,
  getStateFromIdPath,
  isFolder,
} from "../utils";

import { CollectionItemPickerResolver } from "./CollectionItemPickerResolver";

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};

interface CollectionPickerProps {
  initialValue?: Partial<CollectionPickerItem>;
  options?: CollectionPickerOptions;
  path: CollectionPickerStatePath | undefined;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
  onInit: (item: CollectionPickerItem) => void;
  onItemSelect: (item: CollectionPickerItem) => void;
  onPathChange: (path: CollectionPickerStatePath) => void;
}

export const CollectionPickerInner = (
  {
    initialValue,
    options = defaultOptions,
    path: pathProp,
    shouldDisableItem,
    onInit,
    onItemSelect,
    onPathChange,
  }: CollectionPickerProps,
  ref: Ref<unknown>,
) => {
  const defaultPath = useMemo(() => {
    return getStateFromIdPath({
      idPath: ["root"],
      namespace: options.namespace,
    });
  }, [options.namespace]);
  const path = pathProp ?? defaultPath;

  const {
    data: currentCollection,
    error,
    isLoading: loadingCurrentCollection,
  } = useCollectionQuery({
    id: isValidCollectionId(initialValue?.id) ? initialValue?.id : "root",
  });

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: CollectionPickerItem }) => {
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(folder, userPersonalCollectionId),
        namespace: options.namespace,
      });
      onItemSelect(folder);
      onPathChange(newPath);
    },
    [onItemSelect, onPathChange, options.namespace, userPersonalCollectionId],
  );

  const handleItemSelect = useCallback(
    (item: CollectionPickerItem) => {
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
    [path, onItemSelect, onPathChange, userPersonalCollectionId],
  );

  const handleNewCollection = useCallback(
    (newCollection: Collection) => {
      const parentCollectionId = getParentCollectionId(newCollection.location);

      const newCollectionItem: CollectionPickerItem = {
        ...newCollection,
        collection_id: parentCollectionId,
        model: "collection",
      };

      const selectedItem = path[path.length - 1]?.selectedItem;

      if (selectedItem) {
        // if the currently selected item is not a folder, it will be once we create a new collection within it
        // so we need to select it

        const newPath: CollectionPickerStatePath = [
          ...path,
          {
            query: {
              id: parentCollectionId,
              models: ["collection"],
              namespace: options.namespace,
            },
            selectedItem: newCollectionItem,
          },
        ];
        onItemSelect(newCollectionItem);
        onPathChange(newPath);
        return;
      }

      handleItemSelect(newCollectionItem);
    },
    [path, handleItemSelect, onItemSelect, onPathChange, options.namespace],
  );

  // Exposing onNewCollection so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      onNewCollection: handleNewCollection,
    }),
    [handleNewCollection],
  );

  useDeepCompareEffect(
    function setInitialPath() {
      // do not overwrite the previously selected item when the user switches
      // tabs; in this case the component is unmounted and this hook runs again
      if (!pathProp && currentCollection?.id) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(
            {
              id: currentCollection.id,
              location: currentCollection.effective_location,
              is_personal: currentCollection.is_personal,
            },
            userPersonalCollectionId,
          ),
          namespace: options.namespace,
        });
        onPathChange(newPath);

        if (currentCollection.can_write) {
          // start with the current item selected if we can
          onItemSelect({
            ...currentCollection,
            model: "collection",
          });
        }
      }
    },
    [
      pathProp,
      currentCollection,
      options.namespace,
      userPersonalCollectionId,
      onPathChange,
    ],
  );

  useEnsureCollectionSelected({
    currentCollection,
    enabled: path === defaultPath,
    options,
    useRootCollection: initialValue?.id == null,
    onInit,
  });

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      isFolder={isFolder}
      shouldDisableItem={shouldDisableItem}
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
    />
  );
};

export const CollectionPicker = forwardRef(CollectionPickerInner);
