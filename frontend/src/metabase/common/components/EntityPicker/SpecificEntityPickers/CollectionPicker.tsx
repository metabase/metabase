import { useEffect, useState, useCallback } from "react";

import { dataCount } from "dc";
import type { Collection, CollectionId } from "metabase-types/api";
import { CollectionsApi, UserApi } from "metabase/services";

import { LoadingSpinner } from "../components/LoadingSpinner";
import { NestedItemPicker } from "../NestedItemPicker";
import type { PickerState } from "../types";

type SearchCollection = Partial<Collection> & { model: string };

interface CollectionPickerProps {
  onItemSelect: (item: SearchCollection) => void;
  value?: SearchCollection;
  options?: CollectionPickerOptions;
}

function getCollectionIdPath(collection: Collection) {
  const pathFromRoot = collection?.location?.split("/").filter(Boolean).map(Number) ?? [];

  const path = collection.is_personal ? [
    null,
    ...pathFromRoot,
    collection.id,
  ] : [
    null,
    'root',
    ...pathFromRoot,
    collection.id,
  ];

  return path;
}

export type CollectionPickerOptions = {
  showPersonalCollection?: boolean;
};

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollection: true,
};

export function CollectionPicker({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) {
  const [ initialState, setInitialState ] = useState<PickerState<Collection>>();

  const onFolderSelect = useCallback(async (folder?: SearchCollection): Promise<SearchCollection[]> => {
    if (!folder?.id) {
      const ourAnalytics = await CollectionsApi.getRoot();

      const collectionsData = [{
        ...ourAnalytics,
        model: 'collection',
        id: 'root',
      }];

      if (options.showPersonalCollection) {
        const currentUser = await UserApi.current();
        const personalCollection = await CollectionsApi.get({ id: currentUser.personal_collection_id });
        collectionsData.push({
          ...personalCollection,
          model: 'collection',
        });
      }

      return collectionsData;
    }

    // because folders are also selectable items in the collection picker, we always select the folder
    onItemSelect(folder ?? { id: 'root', model: 'collection' });

    const items = await CollectionsApi.listItems(
      { id: folder.id, models: ["collection"] },
    );

    return items.data;
  }, [onItemSelect, options]);

  useEffect(() => {
    if (value?.id) {
      CollectionsApi
        .get({ id: value.id })
        .then(async (collection) => {
          const path = getCollectionIdPath(collection);

          const stack = await Promise.all(
            path.map(async (id, index) => {
              const items = await onFolderSelect({ id: (id as CollectionId), model: 'collection' });
              const selectedItem = items.find(item => item.id === path[index + 1]) ?? null;
              return({
                items,
                selectedItem,
              });
            }),
          );

          setInitialState(stack);
        });
    } else {
      // default to showing our analytics selected
      onFolderSelect().then( async (items) => {
        setInitialState([
          { items, selectedItem: { id: 'root', model: 'collection' } },
          { items: await onFolderSelect({ id: 'root', model: 'collection' }), selectedItem: null },
        ]);
      });
    }
  }, [value?.id, onFolderSelect, onItemSelect]);

  if (!initialState) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemModel="question"
      folderModel="collection"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  );
}
