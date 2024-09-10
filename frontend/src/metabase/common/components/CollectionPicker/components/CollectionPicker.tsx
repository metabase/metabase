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
import type {
  CollectionPickerItem,
  CollectionPickerOptions,
  CollectionPickerPath,
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
  path: CollectionPickerPath | undefined;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
  onItemSelect: (item: CollectionPickerItem) => void;
  onPathChange: (path: CollectionPickerPath) => void;
}

export const CollectionPickerInner = (
  {
    initialValue,
    options = defaultOptions,
    path: pathProp,
    shouldDisableItem,
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
    enabled: !!initialValue?.id,
  });

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: CollectionPickerItem }) => {
      const isUserPersonalCollection = folder?.id === userPersonalCollectionId;
      const isUserSubfolder =
        path?.[1]?.query?.id === "personal" && !isUserPersonalCollection;

      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(
          folder,
          userPersonalCollectionId,
          isUserSubfolder,
        ),
        namespace: options.namespace,
      });
      onItemSelect(folder);
      onPathChange(newPath);
    },
    [
      onItemSelect,
      onPathChange,
      options.namespace,
      userPersonalCollectionId,
      path,
    ],
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

        const newPath: CollectionPickerPath = [
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
      if (currentCollection?.id) {
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
    [currentCollection, options.namespace, userPersonalCollectionId],
  );

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
