import { useEffect, useState } from "react";

import type { Collection, CollectionId, SearchResult } from "metabase-types/api";


import { useCollectionQuery } from "metabase/common/hooks";
import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState, PickerItem } from "../types";

export type CollectionPickerOptions = {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};

interface CollectionPickerProps {
  onItemSelect: (item: PickerItem) => void;
  value?: PickerItem;
  options?: CollectionPickerOptions;
}

export const CollectionPicker = ({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) => {
  const [path, setPath] = useState<PickerState<PickerItem>>(() =>
    getStateFromIdPath({
      idPath: [null, 'root'],
      namespace: options.namespace,
    }));

  const { data: currentCollection, isLoading: loadingCurrentCollection } =
    useCollectionQuery({ id: value?.id, enabled: !!value?.id });

  const onFolderSelect = ({
    folder
  }: {
    folder: Partial<SearchResult>;
  }) => {
    const newPath = getStateFromIdPath({
      idPath: getCollectionIdPath(folder as Collection),
      namespace: options.namespace,
    });
    setPath(newPath);
    onItemSelect(folder);
  };

  useEffect(function setInitialPath () {
    if (currentCollection) {
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(currentCollection),
        namespace: options.namespace,
      });

      setPath(newPath);
    }
  }, [currentCollection, options.namespace]);

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemModel="question"
      folderModel="collection"
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      path={path}
    />
  );
};

const getCollectionIdPath = (collection: Collection): CollectionId[] => {
  const pathFromRoot =
    collection?.location?.split("/").filter(Boolean).map(Number) ?? [];


  const path = collection.is_personal || collection.id === "root"
    ? [null, ...pathFromRoot, collection.id]
    : [null, "root", ...pathFromRoot, collection.id];

  return path as CollectionId[];
}

const getStateFromIdPath = ({
  idPath, namespace
}: {
  idPath: CollectionId[]; namespace?: 'snippets'
}): PickerState<SearchResult> => {
  // TODO: handle collections buried in another user's personal collection 😱
  return idPath.map((id, index) => {
    const nextLevelId = idPath[index + 1] ?? null;

    if (index === 0) {
      return {
        selectedItem: {
          model: "collection",
          id: nextLevelId
        },
      };
    }

    return {
      query: {
        collection: id,
        models: ["collection"],
        namespace,
      },
      selectedItem: nextLevelId
        ? { model: "collection", id: nextLevelId }
        : null,
    };
  });
};
