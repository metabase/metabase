import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { useDeepCompareEffect } from "react-use";

import { isValidCollectionId } from "metabase/collections/utils";
import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type {
  Collection,
  ListCollectionItemsRequest,
} from "metabase-types/api";

import {
  LoadingSpinner,
  NestedItemPicker,
  type PickerState,
} from "../../EntityPicker";
import type { CollectionPickerItem, CollectionPickerOptions } from "../types";
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
  onItemSelect: (item: CollectionPickerItem) => void;
  initialValue?: Partial<CollectionPickerItem>;
  options?: CollectionPickerOptions;
  shouldDisableItem?: (item: CollectionPickerItem) => boolean;
}

export const CollectionPickerInner = (
  {
    onItemSelect,
    initialValue,
    options = defaultOptions,
    shouldDisableItem,
  }: CollectionPickerProps,
  ref: Ref<unknown>,
) => {
  const [path, setPath] = useState<
    PickerState<CollectionPickerItem, ListCollectionItemsRequest>
  >(() =>
    getStateFromIdPath({
      idPath: ["root"],
      namespace: options.namespace,
    }),
  );

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
      setPath(newPath);
      onItemSelect(folder);
    },
    [setPath, onItemSelect, options.namespace, userPersonalCollectionId, path],
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

      setPath(newPath);
      onItemSelect(item);
    },
    [path, onItemSelect, setPath, userPersonalCollectionId],
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
        setPath(oldPath => [
          ...oldPath,
          {
            query: {
              id: parentCollectionId,
              models: ["collection"],
              namespace: options.namespace,
            },
            selectedItem: newCollectionItem,
          },
        ]);
        onItemSelect(newCollectionItem);
        return;
      }

      handleItemSelect(newCollectionItem);
    },
    [path, handleItemSelect, onItemSelect, setPath, options.namespace],
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
        setPath(newPath);

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
