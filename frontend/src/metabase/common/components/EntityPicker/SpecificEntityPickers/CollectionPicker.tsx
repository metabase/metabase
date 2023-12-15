import { useEffect, useState, useCallback } from "react";

import type { Collection, SearchResult } from "metabase-types/api";
import { CollectionsApi, UserApi } from "metabase/services";

import Search from "metabase/entities/search";

import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState } from "../types";


export type CollectionPickerOptions = {
  showPersonalCollection?: boolean;
};

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollection: true,
};

interface CollectionPickerProps {
  onItemSelect: (item: SearchResult) => void;
  value?: Partial<SearchResult>;
  options?: CollectionPickerOptions;
}

const rootCollection = {
  id: "root",
  model: "collection",
} as unknown as SearchResult;

function getCollectionIdPath(collection: Collection) {
  const pathFromRoot =
    collection?.location?.split("/").filter(Boolean).map(Number) ?? [];

  const path = collection.is_personal
    ? [null, ...pathFromRoot, collection.id]
    : [null, "root", ...pathFromRoot, collection.id];

  return path;
}

export function CollectionPicker({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) {
  const [initialState, setInitialState] = useState<PickerState<SearchResult>>();

  const onFolderSelect = useCallback(
    async (folder?: Partial<SearchResult>): Promise<SearchResult[]> => {
      if (!folder?.id) {
        const ourAnalytics = await CollectionsApi.getRoot();

        const collectionsData = [
          {
            ...ourAnalytics,
            model: "collection",
            id: "root",
          },
        ];

        if (options.showPersonalCollection) {
          const currentUser = await UserApi.current();
          const personalCollection = await CollectionsApi.get({
            id: currentUser.personal_collection_id,
          });
          collectionsData.push({
            ...personalCollection,
            model: "collection",
          });
        }

        return collectionsData;
      }

      // because folders are also selectable items in the collection picker, we always select the folder
      onItemSelect((folder ?? rootCollection) as SearchResult);

      const items = await Search.api.list({
        collection: folder.id,
        models: ["collection"],
      });

      return items.data;
    },
    [onItemSelect, options],
  );

  useEffect(() => {
    if (value?.id) {
      CollectionsApi.get({ id: value.id }).then(async collection => {
        const path = getCollectionIdPath(collection);

        const stack = await Promise.all(
          path.map(async (id, index) => {
            const items = await onFolderSelect({
              id: id as unknown as number,
              model: "collection",
            });
            const selectedItem =
              items.find(item => item.id === path[index + 1]) ?? null;
            return {
              items,
              selectedItem,
            };
          }),
        );

        setInitialState(stack);
      });
    } else {
      // default to showing our analytics selected
      onFolderSelect().then(async items => {
        setInitialState([
          {
            items,
            selectedItem: rootCollection,
          },
          {
            items: await onFolderSelect(rootCollection),
            selectedItem: null,
          },
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
